import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ApiRequest extends IncomingMessage {
  body?: unknown;
  query?: Record<string, unknown>;
  params?: Record<string, string | undefined>;
}

export interface ApiResponse extends ServerResponse {
  status?: (code: number) => ApiResponse;
  json?: (payload: unknown) => ApiResponse;
  send?: (payload: unknown) => ApiResponse;
}

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

const DEFAULT_MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB

export async function readJsonBody<T = Record<string, unknown>>(
  req: ApiRequest,
  maxBytes = DEFAULT_MAX_BODY_BYTES
): Promise<T> {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      if (!req.body.trim()) return {} as T;
      try {
        return JSON.parse(req.body) as T;
      } catch {
        throw new HttpError(400, 'Invalid JSON request body.');
      }
    }
    if (Buffer.isBuffer(req.body)) {
      const text = req.body.toString('utf8');
      if (!text.trim()) return {} as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new HttpError(400, 'Invalid JSON request body.');
      }
    }
    if (typeof req.body === 'object' && req.body !== null) {
      return req.body as T;
    }
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  return new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    req.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        settled = true;
        reject(new HttpError(413, 'Request payload exceeds maximum allowed size.'));
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch {
        reject(new HttpError(400, 'Invalid JSON request body.'));
      }
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(new HttpError(400, err instanceof Error ? err.message : 'Failed to read request body.'));
    });
  });
}

export function sendJson(res: ApiResponse, statusCode: number, payload: unknown): void {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(statusCode).json(payload);
    return;
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function sendText(res: ApiResponse, statusCode: number, text: string): void {
  if (typeof res.status === 'function' && typeof res.send === 'function') {
    res.status(statusCode).send(text);
    return;
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

export function handlePreflight(req: ApiRequest, res: ApiResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    lower === 'localhost' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }

  // IPv4 checks
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (
      a === 127 ||
      a === 10 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
  }

  // IPv6 private/link-local/loopback checks
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
    return true;
  }

  return false;
}

export function validatePublicHttpUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new HttpError(400, 'Please provide a valid URL starting with http:// or https://.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'Only http:// and https:// URLs are supported.');
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new HttpError(400, 'Private or local network URLs are not allowed.');
  }
  return parsed.toString();
}
