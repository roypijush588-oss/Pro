export interface SummaryOptions {
  length: string; // '25%', '50%', '75%'
  format: string; // 'Paragraph', 'Bullet points'
  mode: string; // 'Simple explanation', 'Study notes', 'Key points only', 'Exam revision mode'
  language: string;
}

const CLIENT_TIMEOUT_MS = 65_000;
const CLIENT_CACHE_TTL_MS = 15 * 60_000;
const MAX_CLIENT_CACHE_ENTRIES = 40;

interface ClientCacheEntry {
  value: unknown;
  expiresAt: number;
}

const clientResponseCache = new Map<string, ClientCacheEntry>();
const clientInFlightRequests = new Map<string, Promise<unknown>>();

export class GeminiRequestError extends Error {
  status: number;
  retryAfterSeconds?: number;
  isQuotaError: boolean;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = 'GeminiRequestError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.isQuotaError =
      status === 429 ||
      message.includes('429') ||
      message.includes('RESOURCE_EXHAUSTED') ||
      message.toLowerCase().includes('quota');
  }
}

export function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof GeminiRequestError && error.isQuotaError) return true;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    message.includes('429') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  );
}

export function formatGeminiErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (isQuotaExceededError(error)) {
    if (message.includes('Settings > Secrets') || message.includes('Please retry in') || message.includes('rate limit reached') || message.includes('quota limit reached')) {
      return message;
    }
    return 'API quota limit reached (429). Please wait a moment and try again, or select a billing-enabled API key in Settings > Secrets.';
  }
  return message || fallback;
}

function buildClientCacheKey(endpoint: string, payload: Record<string, unknown>): string {
  return `${endpoint}:${JSON.stringify(payload)}`;
}

function getClientCached<T>(key: string): { hit: boolean; value?: T } {
  const entry = clientResponseCache.get(key);
  if (!entry) return { hit: false };
  if (Date.now() > entry.expiresAt) {
    clientResponseCache.delete(key);
    return { hit: false };
  }
  clientResponseCache.delete(key);
  clientResponseCache.set(key, entry);
  return { hit: true, value: entry.value as T };
}

function setClientCached(key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  if (key.length > 250_000) return;
  if (clientResponseCache.size >= MAX_CLIENT_CACHE_ENTRIES) {
    const oldest = clientResponseCache.keys().next().value;
    if (oldest) clientResponseCache.delete(oldest);
  }
  clientResponseCache.set(key, {
    value,
    expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
  });
}

async function postGemini<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const cacheKey = buildClientCacheKey(endpoint, payload);
  const cached = getClientCached<T>(cacheKey);
  if (cached.hit) {
    return cached.value as T;
  }

  const existingInFlight = clientInFlightRequests.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight as Promise<T>;
  }

  const requestPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/gemini/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let data: { result?: T; error?: string; code?: number; retryAfterSeconds?: number } = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as {
            result?: T;
            error?: string;
            code?: number;
            retryAfterSeconds?: number;
          };
        } catch {
          // Non-JSON response (e.g. proxy/gateway error page)
        }
      }

      if (!response.ok) {
        const retryHeader = response.headers.get('Retry-After');
        const retryAfterSeconds =
          data.retryAfterSeconds ??
          (retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : undefined);

        if (data.error) {
          throw new GeminiRequestError(data.error, response.status, retryAfterSeconds);
        }
        if (response.status === 429) {
          throw new GeminiRequestError(
            'API quota limit reached (429). Please wait a moment and try again, or select a billing-enabled API key in Settings > Secrets.',
            429,
            retryAfterSeconds
          );
        }
        if (response.status === 413) {
          throw new GeminiRequestError(
            'The uploaded image or text is too large. Please try a smaller file or shorter input.',
            413
          );
        }
        if (response.status === 504) {
          throw new GeminiRequestError(
            'The server timed out while waiting for the AI response. Please try again.',
            504
          );
        }
        throw new GeminiRequestError(
          rawText.slice(0, 200) || `Request failed with status ${response.status}`,
          response.status,
          retryAfterSeconds
        );
      }

      const result = data.result as T;
      setClientCached(cacheKey, result);
      return result;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Request timed out. Please check your connection and try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      clientInFlightRequests.delete(cacheKey);
    }
  })();

  clientInFlightRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

export async function generateSummary(text: string, options: SummaryOptions, imageUrl?: string, url?: string) {
  return postGemini<string>('summary', { text, options, imageUrl, url });
}

export async function generateFlashcards(text: string) {
  return postGemini<{ id: string; question: string; answer: string }[]>('flashcards', { text });
}

export async function generateQuiz(text: string) {
  return postGemini<{
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  }[]>('quiz', { text });
}

export async function generateInteractiveStudy(topic: string) {
  return postGemini<{
    keyPoints: string[];
    flashcards: { front: string; back: string }[];
    quiz: {
      question: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }[];
  }>('interactive-study', { topic });
}

export async function solveHomework(text: string, imageUrl?: string) {
  return postGemini<string>('homework', { text, imageUrl });
}

export async function createNotes(text: string, imageUrl?: string) {
  return postGemini<string>('notes', { text, imageUrl });
}

export async function generateQuestions(text: string, imageUrl?: string) {
  return postGemini<string>('questions', { text, imageUrl });
}

export async function generateRevisionContent(text: string, imageUrl?: string) {
  return postGemini<string>('revision', { text, imageUrl });
}

export async function generatePractice(text: string, imageUrl?: string) {
  return postGemini<string>('practice', { text, imageUrl });
}

export async function generateStructuredPractice(text: string, imageUrl?: string) {
  return postGemini<string>('structured-practice', { text, imageUrl });
}

export async function generateStructuredQuestions(text: string, imageUrl?: string) {
  return postGemini<string>('structured-questions', { text, imageUrl });
}

export async function generateStudyLesson(topic: string, imageUrl?: string) {
  return postGemini<string>('study-lesson', { topic, imageUrl });
}

export async function chatWithSummary(summary: string, question: string) {
  return postGemini<string>('chat-summary', { summary, question });
}
