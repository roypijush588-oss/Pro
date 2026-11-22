export const CLIENT_TIMEOUT_MS = 65_000;

export class GeminiRequestError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  retryAfterSeconds?: number;

  constructor(options: {
    message: string;
    status: number;
    code: string;
    retryable: boolean;
    retryAfterSeconds?: number;
  }) {
    super(options.message);
    this.name = 'GeminiRequestError';
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function isRetryableGeminiError(error: unknown): boolean {
  if (error instanceof GeminiRequestError) {
    return error.retryable;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('timed out') ||
      msg.includes('timeout') ||
      msg.includes('network') ||
      msg.includes('failed to fetch') ||
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('502') ||
      msg.includes('504') ||
      msg.includes('500') ||
      msg.includes('unavailable') ||
      msg.includes('rate-limited') ||
      msg.includes('high demand')
    );
  }
  return false;
}

export function getGeminiErrorMessage(error: unknown, fallback = 'Request failed. Please try again.'): string {
  if (error instanceof GeminiRequestError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

const inFlightRequests = new Map<string, Promise<unknown>>();

function buildRequestKey(endpoint: string, payload: Record<string, unknown>): string {
  try {
    return `${endpoint}:${JSON.stringify(payload)}`;
  } catch {
    return `${endpoint}:${Date.now()}`;
  }
}

export interface PostGeminiOptions {
  timeoutMs?: number;
  dedupe?: boolean;
}

export async function postGemini<T>(
  endpoint: string,
  payload: Record<string, unknown>,
  options?: PostGeminiOptions
): Promise<T> {
  const dedupe = options?.dedupe !== false;
  const requestKey = dedupe ? buildRequestKey(endpoint, payload) : '';

  if (dedupe) {
    const existing = inFlightRequests.get(requestKey);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const timeoutMs = options?.timeoutMs ?? CLIENT_TIMEOUT_MS;

  const execute = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`/api/gemini/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let data: {
        result?: T;
        error?: string;
        code?: string;
        retryable?: boolean;
        status?: number;
        retryAfterSeconds?: number;
      } = {};

      if (rawText) {
        try {
          data = JSON.parse(rawText) as typeof data;
        } catch {
          // Non-JSON response (e.g., proxy/gateway error page)
        }
      }

      if (!response.ok) {
        const status = response.status;
        const retryableStatus = status === 429 || status === 408 || status === 500 || status === 502 || status === 503 || status === 504;
        const retryable =
          typeof data.retryable === 'boolean'
            ? data.retryable
            : retryableStatus;

        if (data.error) {
          throw new GeminiRequestError({
            message: data.error,
            status,
            code: data.code || (status === 504 ? 'TIMEOUT' : status === 429 ? 'RATE_LIMITED' : 'API_ERROR'),
            retryable,
            retryAfterSeconds: data.retryAfterSeconds,
          });
        }

        if (status === 413) {
          throw new GeminiRequestError({
            message: 'The uploaded image or text is too large. Please try a smaller file or shorter input.',
            status,
            code: 'PAYLOAD_TOO_LARGE',
            retryable: false,
          });
        }

        if (status === 504) {
          throw new GeminiRequestError({
            message: 'The server timed out while waiting for the AI response. Please try again.',
            status,
            code: 'TIMEOUT',
            retryable: true,
          });
        }

        if (status === 503) {
          throw new GeminiRequestError({
            message: 'The AI service is temporarily unavailable due to high demand. Please try again.',
            status,
            code: 'SERVICE_UNAVAILABLE',
            retryable: true,
          });
        }

        if (status === 429) {
          throw new GeminiRequestError({
            message: 'Too many requests right now. Please wait a moment and try again.',
            status,
            code: 'RATE_LIMITED',
            retryable: true,
          });
        }

        throw new GeminiRequestError({
          message: rawText.slice(0, 200) || `Request failed with status ${status}`,
          status,
          code: 'API_ERROR',
          retryable,
        });
      }

      return data.result as T;
    } catch (error) {
      if (error instanceof GeminiRequestError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new GeminiRequestError({
          message: 'The request timed out before completing. Please check your connection and try again.',
          status: 504,
          code: 'TIMEOUT',
          retryable: true,
        });
      }
      if (error instanceof TypeError) {
        throw new GeminiRequestError({
          message: 'Network connection error while contacting the server. Please check your connection and try again.',
          status: 0,
          code: 'NETWORK_ERROR',
          retryable: true,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  if (dedupe) {
    inFlightRequests.set(requestKey, execute);
    execute.finally(() => {
      if (inFlightRequests.get(requestKey) === execute) {
        inFlightRequests.delete(requestKey);
      }
    }).catch(() => {
      // Errors are handled by caller
    });
  }

  return execute;
}

export function clearInFlightRequestsForTesting(): void {
  inFlightRequests.clear();
}
