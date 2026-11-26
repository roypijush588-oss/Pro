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

export const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB
export const MAX_TEXT_ONLY_BODY_BYTES = 256 * 1024; // 256 KB
export const MAX_PDF_BODY_BYTES = 512 * 1024; // 512 KB
const MAX_URL_LENGTH = 2048;

const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizePlainValue(value: unknown, depth = 0): unknown {
  if (depth > 12) {
    throw new HttpError(400, 'Request payload nesting depth exceeds allowed limit.');
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePlainValue(item, depth + 1));
  }
  const output: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) {
      continue;
    }
    output[key] = sanitizePlainValue(entryValue, depth + 1);
  }
  return output;
}

function assertPlainObject(parsed: unknown): Record<string, unknown> {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  return sanitizePlainValue(parsed) as Record<string, unknown>;
}

function getHeaderString(req: ApiRequest, name: string): string {
  const raw = req.headers?.[name.toLowerCase()];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
    return raw[0].trim();
  }
  return '';
}

export function getClientIp(req: ApiRequest): string {
  const candidates = [
    getHeaderString(req, 'x-real-ip'),
    getHeaderString(req, 'x-vercel-forwarded-for'),
    getHeaderString(req, 'cf-connecting-ip'),
    getHeaderString(req, 'x-forwarded-for').split(',')[0]?.trim() ?? '',
    req.socket?.remoteAddress?.trim() ?? '',
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = candidate.replace(/^::ffff:/i, '').slice(0, 64);
    if (/^[0-9a-fA-F:.]+$/.test(normalized)) {
      return normalized;
    }
  }
  return 'unknown';
}

export function applyApiSecurityHeaders(res: ApiResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');
}

function normalizeOrigin(rawOrigin: string): string | null {
  try {
    const parsed = new URL(rawOrigin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function isOriginAllowed(req: ApiRequest, originHeader: string): boolean {
  const normalizedOrigin = normalizeOrigin(originHeader);
  if (!normalizedOrigin) return false;

  const allowedOrigins = new Set<string>();

  const forwardedHost = getHeaderString(req, 'x-forwarded-host').split(',')[0]?.trim();
  const host = forwardedHost || getHeaderString(req, 'host');
  if (host) {
    const cleanHost = host.toLowerCase();
    allowedOrigins.add(`https://${cleanHost}`);
    const isProduction = process.env.NODE_ENV === 'production' && !cleanHost.startsWith('localhost') && !cleanHost.startsWith('127.0.0.1');
    if (!isProduction) {
      allowedOrigins.add(`http://${cleanHost}`);
    }
  }

  const vercelHosts = [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ];
  for (const vercelHost of vercelHosts) {
    if (vercelHost && vercelHost.trim()) {
      allowedOrigins.add(`https://${vercelHost.trim().toLowerCase()}`);
    }
  }

  const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  for (const extra of extraOrigins) {
    const normalizedExtra = normalizeOrigin(extra);
    if (normalizedExtra) {
      allowedOrigins.add(normalizedExtra);
    }
  }

  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    allowedOrigins.add('http://localhost:3000');
    allowedOrigins.add('http://127.0.0.1:3000');
  }

  return allowedOrigins.has(normalizedOrigin);
}

export function handleCorsAndPreflight(
  req: ApiRequest,
  res: ApiResponse,
  format: 'json' | 'text' = 'json'
): boolean {
  applyApiSecurityHeaders(res);
  res.setHeader('Vary', 'Origin');

  const origin = getHeaderString(req, 'origin');
  if (origin) {
    if (!isOriginAllowed(req, origin)) {
      if (format === 'text') {
        sendText(res, 403, 'Cross-origin requests are not allowed.');
      } else {
        sendJson(res, 403, { error: 'Cross-origin requests are not allowed.', code: 403 });
      }
      return true;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  return false;
}

export async function readJsonBody<T = Record<string, unknown>>(
  req: ApiRequest,
  maxBytes = DEFAULT_MAX_BODY_BYTES
): Promise<T> {
  const contentLengthHeader = getHeaderString(req, 'content-length');
  if (contentLengthHeader) {
    const declaredLength = Number(contentLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new HttpError(413, 'Request payload exceeds maximum allowed size.');
    }
  }

  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > maxBytes) {
        throw new HttpError(413, 'Request payload exceeds maximum allowed size.');
      }
      if (!req.body.trim()) return {} as T;
      try {
        return assertPlainObject(JSON.parse(req.body)) as T;
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(400, 'Invalid JSON request body.');
      }
    }
    if (Buffer.isBuffer(req.body)) {
      if (req.body.length > maxBytes) {
        throw new HttpError(413, 'Request payload exceeds maximum allowed size.');
      }
      const text = req.body.toString('utf8');
      if (!text.trim()) return {} as T;
      try {
        return assertPlainObject(JSON.parse(text)) as T;
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(400, 'Invalid JSON request body.');
      }
    }
    if (typeof req.body === 'object' && req.body !== null) {
      const sanitized = assertPlainObject(req.body);
      const serializedBytes = Buffer.byteLength(JSON.stringify(sanitized), 'utf8');
      if (serializedBytes > maxBytes) {
        throw new HttpError(413, 'Request payload exceeds maximum allowed size.');
      }
      return sanitized as T;
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
        resolve(assertPlainObject(JSON.parse(raw)) as T);
      } catch (err) {
        if (err instanceof HttpError) {
          reject(err);
          return;
        }
        reject(new HttpError(400, 'Invalid JSON request body.'));
      }
    });

    req.on('error', () => {
      if (settled) return;
      settled = true;
      reject(new HttpError(400, 'Failed to read request body.'));
    });
  });
}

export function sendJson(res: ApiResponse, statusCode: number, payload: unknown): void {
  applyApiSecurityHeaders(res);
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(statusCode).json(payload);
    return;
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function sendText(res: ApiResponse, statusCode: number, text: string): void {
  applyApiSecurityHeaders(res);
  if (typeof res.status === 'function' && typeof res.send === 'function') {
    res.status(statusCode).send(text);
    return;
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

export function handlePreflight(req: ApiRequest, res: ApiResponse): boolean {
  return handleCorsAndPreflight(req, res, 'json');
}

function isBlockedIpv4Octets(octets: number[]): boolean {
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b, c] = octets;
  if (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
    (a === 169 && b === 254) || // Link-local / Cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // RFC1918
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // TEST-NET-1
    (a === 192 && b === 168) || // RFC1918
    (a === 198 && (b === 18 || b === 19)) || // Benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // Multicast + reserved
  ) {
    return true;
  }
  return false;
}

export function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (!lower) return true;

  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower === '0.0.0.0' ||
    lower === '::' ||
    lower === '::1' ||
    lower === 'metadata' ||
    lower === 'metadata.google.internal' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.localdomain')
  ) {
    return true;
  }

  // IPv4-mapped IPv6 dotted form: ::ffff:127.0.0.1
  const mappedDottedMatch = lower.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (mappedDottedMatch) {
    return isBlockedIpv4Octets(mappedDottedMatch.slice(1).map(Number));
  }

  // IPv4-mapped IPv6 hex form normalized by URL parser: ::ffff:7f00:1 or ::ffff:a9fe:a9fe
  const mappedHexMatch = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHexMatch) {
    const hi = Number.parseInt(mappedHexMatch[1], 16);
    const lo = Number.parseInt(mappedHexMatch[2], 16);
    const octets = [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
    return isBlockedIpv4Octets(octets);
  }

  // Plain IPv4 dotted-quad check
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    return isBlockedIpv4Octets(ipv4Match.slice(1).map(Number));
  }

  // IPv6 private/link-local/loopback/multicast/unspecified checks
  if (lower.includes(':')) {
    const firstHextet = lower.split(':')[0] || '0';
    if (
      lower === '::' ||
      lower === '::1' ||
      /^0+:0+:0+:0+:0+:0+:0+:[01]$/.test(lower) ||
      /^f[cd][0-9a-f]{0,2}$/.test(firstHextet) || // fc00::/7 ULA
      /^fe[89ab][0-9a-f]?$/.test(firstHextet) || // fe80::/10 Link-local
      /^ff[0-9a-f]{0,2}$/.test(firstHextet) // ff00::/8 Multicast
    ) {
      return true;
    }
  }

  return false;
}

export function validatePublicHttpUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) {
    throw new HttpError(400, 'Please provide a valid URL under 2,048 characters.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new HttpError(400, 'Please provide a valid URL starting with http:// or https://.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'Only http:// and https:// URLs are supported.');
  }
  if (parsed.username || parsed.password) {
    throw new HttpError(400, 'URLs containing embedded credentials are not allowed.');
  }
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    throw new HttpError(400, 'Only standard HTTP/HTTPS ports are allowed.');
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new HttpError(400, 'Private or local network URLs are not allowed.');
  }
  return parsed.toString();
}
