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
  normalizeAllowedImageMimeType,
  parseDataUrl,
  parseRetryAfterSeconds,
  solveHomework,
  translateText,
  validateBase64ImageData,
  type SummaryOptions,
} from './gemini.ts';
import type { StudyMode } from '../types.ts';
import type { ApiRequest, ApiResponse } from './httpUtils.ts';
import {
  DEFAULT_MAX_BODY_BYTES,
  HttpError,
  MAX_TEXT_ONLY_BODY_BYTES,
  handleCorsAndPreflight,
  readJsonBody,
  sendJson,
  validatePublicHttpUrl,
} from './httpUtils.ts';
import { enforceRateLimit, type RateLimitTier } from './rateLimiter.ts';

const GEMINI_REQUEST_TIMEOUT_MS = 55_000;
const RESPONSE_CACHE_TTL_MS = 30 * 60_000;
const MAX_CACHE_ENTRIES = 150;
const MAX_CACHEABLE_SERIALIZED_LENGTH = 512_000;

export const MAX_TEXT_INPUT_LENGTH = 50_000;
export const MAX_TOPIC_INPUT_LENGTH = 2_000;
export const MAX_QUESTION_INPUT_LENGTH = 4_000;
export const MAX_LANGUAGE_LENGTH = 50;
export const MAX_SPEECH_INPUT_LENGTH = 5_000;
export const MAX_IMAGES_COUNT = 5;
export const MAX_PREVIOUS_TOPICS = 20;
export const MAX_PREVIOUS_TOPIC_LENGTH = 200;

export const ALLOWED_GEMINI_ENDPOINTS = new Set([
  'summary',
  'flashcards',
  'quiz',
  'interactive-study',
  'homework',
  'notes',
  'questions',
  'revision',
  'practice',
  'structured-practice',
  'structured-questions',
  'study-lesson',
  'chat-summary',
  'educational-text',
  'educational-image',
  'deep-dive',
  'speech',
  'translate',
]);

const TEXT_ONLY_ENDPOINTS = new Set([
  'flashcards',
  'quiz',
  'interactive-study',
  'chat-summary',
  'educational-text',
  'deep-dive',
  'speech',
  'translate',
]);

const ALLOWED_SUMMARY_LENGTHS = new Set(['25%', '50%', '75%']);
const ALLOWED_SUMMARY_FORMATS = new Set(['Paragraph', 'Bullet points']);
const ALLOWED_SUMMARY_MODES = new Set([
  'Simple explanation',
  'Study notes',
  'Key points only',
  'Exam revision mode',
]);
const ALLOWED_STUDY_MODES = new Set(['Student', 'KnowledgeBuilder', 'DeepDive', 'Summary']);
const ALLOWED_DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);

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

function requireBoundedString(
  value: unknown,
  fieldLabel: string,
  maxLength: number,
  required = false
): string {
  if (value === undefined || value === null) {
    if (required) {
      throw new HttpError(400, `${fieldLabel} is required.`);
    }
    return '';
  }
  if (typeof value !== 'string') {
    throw new HttpError(400, `${fieldLabel} must be a string.`);
  }
  if (value.length > maxLength) {
    throw new HttpError(413, `${fieldLabel} exceeds maximum length of ${maxLength} characters.`);
  }
  if (required && !value.trim()) {
    throw new HttpError(400, `${fieldLabel} cannot be empty.`);
  }
  return value;
}

function validateOptionalImageDataUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new HttpError(400, 'imageUrl must be a valid base64 image data URL.');
  }
  try {
    parseDataUrl(value);
    return value;
  } catch (err) {
    throw new HttpError(
      400,
      err instanceof Error ? err.message : 'Invalid image data URL.'
    );
  }
}

function validateLanguage(value: unknown, fallback = 'English'): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'Language must be a string.');
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LANGUAGE_LENGTH || !/^[\p{L}\p{N}\s().-]+$/u.test(trimmed)) {
    throw new HttpError(400, 'Invalid language parameter.');
  }
  return trimmed;
}

function validateSummaryOptions(raw: unknown): SummaryOptions {
  if (raw !== undefined && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) {
    throw new HttpError(400, 'Invalid summary options.');
  }
  const opts = (raw ?? {}) as Partial<SummaryOptions>;
  const length = opts.length === undefined ? DEFAULT_SUMMARY_OPTIONS.length : String(opts.length);
  const format = opts.format === undefined ? DEFAULT_SUMMARY_OPTIONS.format : String(opts.format);
  const mode = opts.mode === undefined ? DEFAULT_SUMMARY_OPTIONS.mode : String(opts.mode);
  const language = validateLanguage(opts.language, DEFAULT_SUMMARY_OPTIONS.language);

  if (!ALLOWED_SUMMARY_LENGTHS.has(length)) {
    throw new HttpError(400, 'Invalid summary length option.');
  }
  if (!ALLOWED_SUMMARY_FORMATS.has(format)) {
    throw new HttpError(400, 'Invalid summary format option.');
  }
  if (!ALLOWED_SUMMARY_MODES.has(mode)) {
    throw new HttpError(400, 'Invalid summary mode option.');
  }

  return { length, format, mode, language };
}

function validateStudyMode(value: unknown): StudyMode {
  if (value === undefined || value === null || value === '') {
    return 'Summary' as StudyMode;
  }
  if (typeof value !== 'string' || !ALLOWED_STUDY_MODES.has(value)) {
    throw new HttpError(400, 'Invalid study mode.');
  }
  return value as StudyMode;
}

function validateDifficulty(value: unknown): 'Easy' | 'Medium' | 'Hard' {
  if (value === undefined || value === null || value === '') {
    return 'Medium';
  }
  if (typeof value !== 'string' || !ALLOWED_DIFFICULTIES.has(value)) {
    throw new HttpError(400, 'Invalid difficulty level.');
  }
  return value as 'Easy' | 'Medium' | 'Hard';
}

function validatePreviousTopics(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'previousTopics must be an array of strings.');
  }
  if (value.length > MAX_PREVIOUS_TOPICS) {
    throw new HttpError(400, `previousTopics cannot exceed ${MAX_PREVIOUS_TOPICS} items.`);
  }
  return value.map((item) => {
    if (typeof item !== 'string') {
      throw new HttpError(400, 'Each previous topic must be a string.');
    }
    if (item.length > MAX_PREVIOUS_TOPIC_LENGTH) {
      throw new HttpError(400, 'A previous topic entry exceeds the maximum allowed length.');
    }
    return item.trim();
  }).filter(Boolean);
}

export function sendGeminiError(res: ApiResponse, error: unknown): void {
  const internalMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Gemini API Error:', internalMessage);

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

  if (
    internalMessage.includes('GEMINI_API_KEY is not configured') ||
    internalMessage.includes('API_KEY_INVALID') ||
    internalMessage.includes('API key not valid') ||
    internalMessage.includes('PERMISSION_DENIED')
  ) {
    sendJson(res, 503, {
      error: 'AI service is temporarily unavailable. Please try again later.',
      code: 503,
    });
    return;
  }

  if (
    internalMessage.includes('Invalid image data URL') ||
    internalMessage.includes('Unsupported image format') ||
    internalMessage.includes('Image size is invalid')
  ) {
    sendJson(res, 400, { error: internalMessage, code: 400 });
    return;
  }

  if (internalMessage.includes('Could not extract readable content')) {
    sendJson(res, 422, { error: internalMessage, code: 422 });
    return;
  }

  if (
    internalMessage.includes('timed out') ||
    internalMessage.includes('ETIMEDOUT') ||
    internalMessage.includes('ABORT_ERR')
  ) {
    sendJson(res, 504, { error: 'The AI request timed out. Please try again.', code: 504 });
    return;
  }

  if (isQuotaErrorMessage(internalMessage)) {
    const retryAfterSeconds = parseRetryAfterSeconds(internalMessage);
    if (retryAfterSeconds) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
    }
    sendJson(res, 429, {
      error: formatQuotaExceededMessage(internalMessage, retryAfterSeconds),
      code: 429,
      retryAfterSeconds,
    });
    return;
  }

  // Never leak raw internal server errors, SDK internals, or stack messages to public clients.
  sendJson(res, 500, {
    error: 'Unable to process your request right now. Please try again later.',
    code: 500,
  });
}

export async function dispatchGeminiEndpoint(
  endpoint: string,
  body: Record<string, unknown>
): Promise<unknown> {
  if (!ALLOWED_GEMINI_ENDPOINTS.has(endpoint)) {
    throw new HttpError(404, 'Unsupported AI endpoint.');
  }

  switch (endpoint) {
    case 'summary': {
      const text = requireBoundedString(body.text, 'Text content', MAX_TEXT_INPUT_LENGTH);
      const options = validateSummaryOptions(body.options);
      const imageUrl = validateOptionalImageDataUrl(body.imageUrl);
      const rawUrl =
        typeof body.url === 'string' && body.url.trim().length > 0 ? body.url.trim() : undefined;
      if (body.url !== undefined && body.url !== null && typeof body.url !== 'string') {
        throw new HttpError(400, 'URL must be a string.');
      }
      const url = rawUrl ? validatePublicHttpUrl(rawUrl) : undefined;
      if (!text.trim() && !imageUrl && !url) {
        throw new HttpError(400, 'Please provide text, an image, or a URL to summarize.');
      }
      return generateSummary(text, options, imageUrl, url);
    }

    case 'flashcards': {
      const text = requireBoundedString(body.text, 'Text content', MAX_TEXT_INPUT_LENGTH, true);
      return generateFlashcards(text);
    }

    case 'quiz': {
      const text = requireBoundedString(body.text, 'Text content', MAX_TEXT_INPUT_LENGTH, true);
      return generateQuiz(text);
    }

    case 'interactive-study': {
      const topic = requireBoundedString(body.topic, 'Topic', MAX_TOPIC_INPUT_LENGTH, true);
      return generateInteractiveStudy(topic);
    }

    case 'homework': {
      const text = requireBoundedString(body.text, 'Question text', MAX_TEXT_INPUT_LENGTH);
      const imageUrl = validateOptionalImageDataUrl(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide a homework question or image.');
      }
      return solveHomework(text, imageUrl);
    }

    case 'notes': {
      const text = requireBoundedString(body.text, 'Text content', MAX_TEXT_INPUT_LENGTH);
      const imageUrl = validateOptionalImageDataUrl(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide content or an image to create notes.');
      }
      return createNotes(text, imageUrl);
    }

    case 'questions': {
      const text = requireBoundedString(body.text, 'Text content', MAX_TEXT_INPUT_LENGTH);
      const imageUrl = validateOptionalImageDataUrl(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide content or an image to generate questions.');
      }
      return generateQuestions(text, imageUrl);
    }

    case 'revision': {
      const text = requireBoundedString(body.text, 'Text content', MAX_TEXT_INPUT_LENGTH);
      const imageUrl = validateOptionalImageDataUrl(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide content or an image to generate revision material.');
      }
      return generateRevisionContent(text, imageUrl);
    }

    case 'practice': {
      const text = requireBoundedString(body.text, 'Text content', MAX_TEXT_INPUT_LENGTH);
      const imageUrl = validateOptionalImageDataUrl(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide content or an image to generate practice material.');
      }
      return generatePractice(text, imageUrl);
    }

    case 'structured-practice': {
      const text = requireBoundedString(body.text, 'Text content', MAX_TEXT_INPUT_LENGTH);
      const imageUrl = validateOptionalImageDataUrl(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide content or an image to generate structured practice.');
      }
      return generateStructuredPractice(text, imageUrl);
    }

    case 'structured-questions': {
      const text = requireBoundedString(body.text, 'Text content', MAX_TEXT_INPUT_LENGTH);
      const imageUrl = validateOptionalImageDataUrl(body.imageUrl);
      if (!text.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide content or an image to generate structured questions.');
      }
      return generateStructuredQuestions(text, imageUrl);
    }

    case 'study-lesson': {
      const topic = requireBoundedString(body.topic, 'Topic', MAX_TOPIC_INPUT_LENGTH);
      const imageUrl = validateOptionalImageDataUrl(body.imageUrl);
      if (!topic.trim() && !imageUrl) {
        throw new HttpError(400, 'Please provide a topic or an image to generate a study lesson.');
      }
      return generateStudyLesson(topic, imageUrl);
    }

    case 'chat-summary': {
      const summary = requireBoundedString(body.summary, 'Summary context', MAX_TEXT_INPUT_LENGTH);
      const question = requireBoundedString(body.question, 'Question', MAX_QUESTION_INPUT_LENGTH, true);
      return chatWithSummary(summary, question);
    }

    case 'educational-text': {
      const text = requireBoundedString(body.text, 'Text content', MAX_TEXT_INPUT_LENGTH, true);
      const mode = validateStudyMode(body.mode);
      const difficulty = validateDifficulty(body.difficulty);
      const previousTopics = validatePreviousTopics(body.previousTopics);
      return generateEducationalContentFromText(text, mode, difficulty, previousTopics);
    }

    case 'educational-image': {
      if (!Array.isArray(body.images) || body.images.length === 0) {
        throw new HttpError(400, 'At least one image is required.');
      }
      if (body.images.length > MAX_IMAGES_COUNT) {
        throw new HttpError(400, `A maximum of ${MAX_IMAGES_COUNT} images is allowed per request.`);
      }
      const images = body.images.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new HttpError(400, 'Each image entry must be an object with base64 and mimeType.');
        }
        const record = item as { base64?: unknown; mimeType?: unknown };
        if (typeof record.base64 !== 'string' || typeof record.mimeType !== 'string') {
          throw new HttpError(400, 'Each image entry must include valid base64 and mimeType strings.');
        }
        try {
          return {
            mimeType: normalizeAllowedImageMimeType(record.mimeType),
            base64: validateBase64ImageData(record.base64),
          };
        } catch (err) {
          throw new HttpError(400, err instanceof Error ? err.message : 'Invalid image data.');
        }
      });
      const mode = validateStudyMode(body.mode);
      const difficulty = validateDifficulty(body.difficulty);
      const additionalPrompt = requireBoundedString(
        body.additionalPrompt,
        'Additional prompt',
        MAX_QUESTION_INPUT_LENGTH
      );
      const previousTopics = validatePreviousTopics(body.previousTopics);
      return generateEducationalContentFromImage(
        images,
        mode,
        difficulty,
        additionalPrompt || undefined,
        previousTopics
      );
    }

    case 'deep-dive': {
      const text = requireBoundedString(body.text, 'Topic text', MAX_TEXT_INPUT_LENGTH, true);
      return generateDeepDiveContentFromText(text);
    }

    case 'speech': {
      const text = requireBoundedString(body.text, 'Speech text', MAX_SPEECH_INPUT_LENGTH, true);
      return generateSpeech(text);
    }

    case 'translate': {
      const text = requireBoundedString(body.text, 'Text to translate', MAX_TEXT_INPUT_LENGTH, true);
      const targetLanguage = validateLanguage(body.targetLanguage, '');
      if (!targetLanguage) {
        throw new HttpError(400, 'targetLanguage is required for translation.');
      }
      return translateText(text, targetLanguage);
    }

    default:
      throw new HttpError(404, 'Unsupported AI endpoint.');
  }
}

export async function handleGeminiRequest(
  req: ApiRequest,
  res: ApiResponse,
  endpoint: string,
  options?: {
    rateLimiter?: Parameters<typeof enforceRateLimit>[4];
    dispatcher?: (endpoint: string, body: Record<string, unknown>) => Promise<unknown>;
  }
): Promise<void> {
  if (handleCorsAndPreflight(req, res, 'json')) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST.', code: 405 });
    return;
  }

  const tier: RateLimitTier =
    endpoint === 'educational-image' || endpoint === 'speech' ? 'gemini-heavy' : 'gemini';

  const allowed = await enforceRateLimit(req, res, tier, 'json', options?.rateLimiter);
  if (!allowed) return;

  if (!ALLOWED_GEMINI_ENDPOINTS.has(endpoint)) {
    sendJson(res, 404, { error: 'Unsupported AI endpoint.', code: 404 });
    return;
  }

  const maxBodyBytes = TEXT_ONLY_ENDPOINTS.has(endpoint)
    ? MAX_TEXT_ONLY_BODY_BYTES
    : DEFAULT_MAX_BODY_BYTES;

  try {
    const body = await readJsonBody<Record<string, unknown>>(req, maxBodyBytes);
    const cacheKey = computeCacheKey(endpoint, body);
    const cached = getCachedResponse(cacheKey);
    if (cached.hit) {
      sendJson(res, 200, { result: cached.value, cached: true });
      return;
    }

    const executeDispatch = options?.dispatcher ?? dispatchGeminiEndpoint;
    let pending = inFlightRequests.get(cacheKey);
    if (!pending) {
      pending = withTimeout(executeDispatch(endpoint, body), GEMINI_REQUEST_TIMEOUT_MS)
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
