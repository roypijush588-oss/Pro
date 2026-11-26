import { createHash } from 'node:crypto';
import {
  QuotaExceededError,
  chatWithSummary,
  createNotes,
  formatQuotaExceededMessage,
  generateDeepDiveContentFromText,
  generateEducationalContentFromImage,
  generateEducationalContentFromText,
  generateFlashcards,
  generatePractice,
  generateQuestions,
  generateQuiz,
  generateInteractiveStudy,
  generateRevisionContent,
  generateSpeech,
  generateStructuredPractice,
  generateStructuredQuestions,
  generateStudyLesson,
  generateSummary,
  isQuotaErrorMessage,
  parseRetryAfterSeconds,
  solveHomework,
  translateText,
  type SummaryOptions,
} from './gemini.ts';
import type { StudyMode } from '../types.ts';
import type { ApiRequest, ApiResponse } from './httpUtils.ts';
import {
  HttpError,
  handlePreflight,
  readJsonBody,
  sendJson,
  validatePublicHttpUrl,
} from './httpUtils.ts';

const GEMINI_REQUEST_TIMEOUT_MS = 55_000;
const RESPONSE_CACHE_TTL_MS = 30 * 60_000;
const MAX_CACHE_ENTRIES = 150;
const MAX_CACHEABLE_SERIALIZED_LENGTH = 512_000;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();

const DEFAULT_SUMMARY_OPTIONS: SummaryOptions = {
  length: '50%',
  format: 'Paragraph',
  mode: 'Study notes',
  language: 'English',
};

function computeCacheKey(endpoint: string, body: Record<string, unknown>): string {
  const stableJson = JSON.stringify({ endpoint, body });
  return createHash('sha256').update(stableJson).digest('hex');
}

function getCachedResponse(key: string): { hit: boolean; value?: unknown } {
  const entry = responseCache.get(key);
  if (!entry) return { hit: false };
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return { hit: false };
  }
  // Refresh LRU order
  responseCache.delete(key);
  responseCache.set(key, entry);
  return { hit: true, value: entry.value };
}

function setCachedResponse(key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (!serialized || serialized.length > MAX_CACHEABLE_SERIALIZED_LENGTH) return;
  } catch {
    return;
  }

  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(key, {
    value,
    expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new HttpError(
          504,
          'The AI request timed out before completing. Please try again with shorter input.'
        )
      );
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function sendGeminiError(res: ApiResponse, error: unknown): void {
  console.error('Gemini API Error:', error);

  if (error instanceof QuotaExceededError) {
    if (error.retryAfterSeconds) {
      res.setHeader('Retry-After', String(error.retryAfterSeconds));
    }
    sendJson(res, 429, {
      error: error.message,
      code: 429,
      retryAfterSeconds: error.retryAfterSeconds,
    });
    return;
  }

  if (error instanceof HttpError) {
    sendJson(res, error.statusCode, { error: error.message, code: error.statusCode });
    return;
  }

  const rawMessage = error instanceof Error ? error.message : 'Gemini API request failed.';

  if (rawMessage.includes('GEMINI_API_KEY is not configured')) {
    sendJson(res, 503, {
      error:
        'Server configuration error: GEMINI_API_KEY is not configured. Add GEMINI_API_KEY in Settings > Secrets or your Vercel Environment Variables.',
      code: 503,
    });
    return;
  }

  if (rawMessage.includes('Invalid image data URL')) {
    sendJson(res, 400, { error: rawMessage, code: 400 });
    return;
  }

  if (rawMessage.includes('timed out') || rawMessage.includes('ETIMEDOUT') || rawMessage.includes('ABORT_ERR')) {
    sendJson(res, 504, { error: 'The Gemini API request timed out. Please try again.', code: 504 });
    return;
  }

  if (isQuotaErrorMessage(rawMessage)) {
    const retryAfterSeconds = parseRetryAfterSeconds(rawMessage);
    if (retryAfterSeconds) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
    }
    sendJson(res, 429, {
      error: formatQuotaExceededMessage(rawMessage, retryAfterSeconds),
      code: 429,
      retryAfterSeconds,
    });
    return;
  }

  if (rawMessage.includes('API_KEY_INVALID') || rawMessage.includes('API key not valid')) {
    sendJson(res, 400, {
      error: 'The configured API key is invalid. Please check GEMINI_API_KEY in Settings > Secrets.',
      code: 400,
    });
    return;
  }

  if (rawMessage.includes('PERMISSION_DENIED') || rawMessage.includes('403')) {
    sendJson(res, 403, {
      error: 'Permission denied for Gemini API. Please check your API key in Settings > Secrets.',
      code: 403,
    });
    return;
  }

  const statusMatch = rawMessage.match(/\b(400|401|403|404|429|500|503)\b/);
  const status = rawMessage.includes('NOT_FOUND') || rawMessage.includes('404')
    ? 404
    : statusMatch
      ? Number(statusMatch[1])
      : 500;

  sendJson(res, status, { error: rawMessage, code: status });
}

export async function dispatchGeminiEndpoint(
  endpoint: string,
  body: Record<string, unknown>
): Promise<unknown> {
  switch (endpoint) {
    case 'summary': {
      const text = asString(body.text);
      const rawOptions = (body.options && typeof body.options === 'object' ? body.options : {}) as Partial<SummaryOptions>;
      const options: SummaryOptions = {
        length: asString(rawOptions.length, DEFAULT_SUMMARY_OPTIONS.length),
        format: asString(rawOptions.format, DEFAULT_SUMMARY_OPTIONS.format),
        mode: asString(rawOptions.mode, DEFAULT_SUMMARY_OPTIONS.mode),
        language: asString(rawOptions.language, DEFAULT_SUMMARY_OPTIONS.language),
      };
      const imageUrl = asOptionalString(body.imageUrl);
      const rawUrl = asOptionalString(body.url);
      const url = rawUrl ? validatePublicHttpUrl(rawUrl) : undefined;
      if (!text && !imageUrl && !url) {
        throw new HttpError(400, 'Please provide text, an image, or a URL to summarize.');
      }
      return generateSummary(text, options, imageUrl, url);
    }

    case 'flashcards': {
      const text = asString(body.text);
      if (!text.trim()) {
        throw new HttpError(400, 'Text content is required to generate flashcards.');
      }
      return generateFlashcards(text);
    }

    case 'quiz': {
      const text = asString(body.text);
      if (!text.trim()) {
        throw new HttpError(400, 'Text content is required to generate a quiz.');
      }
      return generateQuiz(text);
    }

    case 'interactive-study': {
      const topic = asString(body.topic);
      if (!topic.trim()) {
        throw new HttpError(400, 'A topic is required for interactive study.');
      }
      return generateInteractiveStudy(topic);
    }

    case 'homework': {
      const text = asString(body.text);
      const imageUrl = asOptionalString(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide a homework question or image.');
      }
      return solveHomework(text, imageUrl);
    }

    case 'notes': {
      const text = asString(body.text);
      const imageUrl = asOptionalString(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide content or an image to create notes.');
      }
      return createNotes(text, imageUrl);
    }

    case 'questions': {
      const text = asString(body.text);
      const imageUrl = asOptionalString(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide content or an image to generate questions.');
      }
      return generateQuestions(text, imageUrl);
    }

    case 'revision': {
      const text = asString(body.text);
      const imageUrl = asOptionalString(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide content or an image to generate revision material.');
      }
      return generateRevisionContent(text, imageUrl);
    }

    case 'practice': {
      const text = asString(body.text);
      const imageUrl = asOptionalString(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide content or an image to generate practice material.');
      }
      return generatePractice(text, imageUrl);
    }

    case 'structured-practice': {
      const text = asString(body.text);
      const imageUrl = asOptionalString(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide content or an image to generate structured practice.');
      }
      return generateStructuredPractice(text, imageUrl);
    }

    case 'structured-questions': {
      const text = asString(body.text);
      const imageUrl = asOptionalString(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide content or an image to generate structured questions.');
      }
      return generateStructuredQuestions(text, imageUrl);
    }

    case 'study-lesson': {
      const topic = asString(body.topic);
      const imageUrl = asOptionalString(body.imageUrl);
      if (!topic.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide a topic or an image to generate a study lesson.');
      }
      return generateStudyLesson(topic, imageUrl);
    }

    case 'chat-summary': {
      const summary = asString(body.summary);
      const question = asString(body.question);
      if (!question.trim()) {
        throw new HttpError(400, 'A question is required.');
      }
      return chatWithSummary(summary, question);
    }

    case 'educational-text': {
      const text = asString(body.text);
      if (!text.trim()) {
        throw new HttpError(400, 'Text content is required.');
      }
      const mode = (asOptionalString(body.mode) ?? 'Summary') as StudyMode;
      const difficulty = (asOptionalString(body.difficulty) ?? 'Medium') as 'Easy' | 'Medium' | 'Hard';
      const previousTopics = Array.isArray(body.previousTopics)
        ? body.previousTopics.filter((item): item is string => typeof item === 'string')
        : [];
      return generateEducationalContentFromText(text, mode, difficulty, previousTopics);
    }

    case 'educational-image': {
      const images = Array.isArray(body.images)
        ? (body.images as { base64: string; mimeType: string }[])
        : [];
      if (images.length === 0) {
        throw new HttpError(400, 'At least one image is required.');
      }
      const mode = (asOptionalString(body.mode) ?? 'Summary') as StudyMode;
      const difficulty = (asOptionalString(body.difficulty) ?? 'Medium') as 'Easy' | 'Medium' | 'Hard';
      const additionalPrompt = asOptionalString(body.additionalPrompt);
      const previousTopics = Array.isArray(body.previousTopics)
        ? body.previousTopics.filter((item): item is string => typeof item === 'string')
        : [];
      return generateEducationalContentFromImage(
        images,
        mode,
        difficulty,
        additionalPrompt,
        previousTopics
      );
    }

    case 'deep-dive': {
      const text = asString(body.text);
      if (!text.trim()) {
        throw new HttpError(400, 'Topic text is required for deep dive.');
      }
      return generateDeepDiveContentFromText(text);
    }

    case 'speech': {
      const text = asString(body.text);
      if (!text.trim()) {
        throw new HttpError(400, 'Text content is required to generate speech.');
      }
      return generateSpeech(text);
    }

    case 'translate': {
      const text = asString(body.text);
      const targetLanguage = asString(body.targetLanguage);
      if (!text.trim() || !targetLanguage.trim()) {
        throw new HttpError(400, 'Both text and targetLanguage are required for translation.');
      }
      return translateText(text, targetLanguage);
    }

    default:
      throw new HttpError(404, `Unsupported Gemini endpoint: ${endpoint}`);
  }
}

export async function handleGeminiRequest(
  req: ApiRequest,
  res: ApiResponse,
  endpoint: string
): Promise<void> {
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const body = await readJsonBody<Record<string, unknown>>(req);
    const cacheKey = computeCacheKey(endpoint, body);
    const cached = getCachedResponse(cacheKey);
    if (cached.hit) {
      sendJson(res, 200, { result: cached.value, cached: true });
      return;
    }

    let pending = inFlightRequests.get(cacheKey);
    if (!pending) {
      pending = withTimeout(
        dispatchGeminiEndpoint(endpoint, body),
        GEMINI_REQUEST_TIMEOUT_MS
      )
        .then((result) => {
          setCachedResponse(cacheKey, result);
          return result;
        })
        .finally(() => {
          inFlightRequests.delete(cacheKey);
        });
      inFlightRequests.set(cacheKey, pending);
    }

    const result = await pending;
    sendJson(res, 200, { result });
  } catch (error) {
    sendGeminiError(res, error);
  }
}
