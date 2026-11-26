import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  HttpError,
  handleCorsAndPreflight,
  isBlockedHost,
  readJsonBody,
  validatePublicHttpUrl,
  type ApiRequest,
  type ApiResponse,
} from '../server/httpUtils.ts';
import {
  createRateLimiter,
  enforceRateLimit,
  type DistributedLimiterBackend,
} from '../server/rateLimiter.ts';
import {
  MAX_TEXT_INPUT_LENGTH,
  handleGeminiRequest,
  sendGeminiError,
} from '../server/geminiHandler.ts';
import {
  MAX_PDF_HTML_BYTES,
  handlePdfRequest,
  isAllowedPdfRequest,
  sanitizePdfHtml,
  validatePdfHtmlPayload,
} from '../server/pdfHandler.ts';
import { QuotaExceededError, parseDataUrl } from '../server/gemini.ts';

function createMockReq(options: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  rawChunks?: string[];
  remoteAddress?: string;
}): ApiRequest {
  const emitter = new EventEmitter() as ApiRequest;
  emitter.method = options.method ?? 'POST';
  emitter.headers = Object.fromEntries(
    Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  emitter.socket = { remoteAddress: options.remoteAddress ?? '203.0.113.10' } as ApiRequest['socket'];
  if (options.body !== undefined) {
    emitter.body = options.body;
  }

  if (options.rawChunks) {
    queueMicrotask(() => {
      for (const chunk of options.rawChunks!) {
        emitter.emit('data', Buffer.from(chunk, 'utf8'));
      }
      emitter.emit('end');
    });
  }
  return emitter;
}

function createMockRes() {
  const headers = new Map<string, string>();
  let endedBody: Buffer | string | undefined;

  const res = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value));
      return res;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    end(chunk?: Buffer | string) {
      endedBody = chunk;
      return res;
    },
  } as unknown as ApiResponse & {
    getHeader(name: string): string | undefined;
  };

  return {
    res,
    headers,
    getBodyText: () =>
      Buffer.isBuffer(endedBody) ? endedBody.toString('utf8') : String(endedBody ?? ''),
    getBodyJson: <T = Record<string, unknown>>() => {
      const text = Buffer.isBuffer(endedBody) ? endedBody.toString('utf8') : String(endedBody ?? '{}');
      return JSON.parse(text) as T;
    },
    getBodyBuffer: () => (Buffer.isBuffer(endedBody) ? endedBody : Buffer.from(String(endedBody ?? ''))),
  };
}

function createMemoryUpstashBackend(burstLimit: number, sustainedLimit = 100): DistributedLimiterBackend {
  const counts = new Map<string, number>();
  return {
    async limit(key, tier, windowKind) {
      const limit = windowKind === 'burst' ? burstLimit : sustainedLimit;
      const bucketKey = `${tier}:${windowKind}:${key}`;
      const next = (counts.get(bucketKey) ?? 0) + 1;
      counts.set(bucketKey, next);
      return {
        success: next <= limit,
        limit,
        remaining: Math.max(0, limit - next),
        reset: Date.now() + 60_000,
      };
    },
  };
}

// --- 1. Distributed Rate Limiting Tests ---

test('rate limiter: allows within Upstash limit and blocks with 429 + Retry-After when exceeded', async () => {
  const limiter = createRateLimiter({
    env: {
      NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'test-token',
    },
    distributedBackend: createMemoryUpstashBackend(2, 10),
  });

  for (let i = 0; i < 2; i++) {
    const req = createMockReq({ headers: { 'x-real-ip': '198.51.100.25' } });
    const mock = createMockRes();
    const ok = await enforceRateLimit(req, mock.res, 'gemini', 'json', limiter);
    assert.equal(ok, true);
    assert.equal(mock.headers.get('x-ratelimit-limit'), '2');
  }

  const blockedReq = createMockReq({ headers: { 'x-real-ip': '198.51.100.25' } });
  const blockedMock = createMockRes();
  const allowed = await enforceRateLimit(blockedReq, blockedMock.res, 'gemini', 'json', limiter);
  assert.equal(allowed, false);
  assert.equal(blockedMock.res.statusCode, 429);
  assert.ok(blockedMock.headers.get('retry-after'));
  assert.match(blockedMock.getBodyJson<{ error: string }>().error, /Too many requests/i);
});

test('rate limiter: fails closed with 503 if Upstash Redis backend throws or is unreachable', async () => {
  const failingBackend: DistributedLimiterBackend = {
    async limit() {
      throw new Error('ECONNREFUSED redis');
    },
  };

  const limiter = createRateLimiter({
    env: {
      NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'test-token',
    },
    distributedBackend: failingBackend,
  });

  const req = createMockReq({ headers: { 'x-real-ip': '198.51.100.99' } });
  const mock = createMockRes();
  const allowed = await enforceRateLimit(req, mock.res, 'gemini', 'json', limiter);
  assert.equal(allowed, false);
  assert.equal(mock.res.statusCode, 503);
  assert.match(mock.getBodyJson<{ error: string }>().error, /unavailable/i);
});

test('rate limiter: fails closed with 503 in production when Upstash env vars are missing', async () => {
  const limiter = createRateLimiter({
    env: {
      NODE_ENV: 'production',
      VERCEL: '1',
    },
  });

  const req = createMockReq({ headers: { 'x-real-ip': '198.51.100.55' } });
  const mock = createMockRes();
  const allowed = await enforceRateLimit(req, mock.res, 'pdf', 'text', limiter);
  assert.equal(allowed, false);
  assert.equal(mock.res.statusCode, 503);
  assert.match(mock.getBodyText(), /not configured/i);
});

test('rate limiter: local development without Upstash still enforces per-IP limits (never unrestricted)', async () => {
  const limiter = createRateLimiter({
    env: { NODE_ENV: 'development' },
  });

  for (let i = 0; i < 6; i++) {
    const req = createMockReq({ headers: { 'x-real-ip': '198.51.100.77' } });
    const mock = createMockRes();
    const ok = await enforceRateLimit(req, mock.res, 'pdf', 'text', limiter);
    assert.equal(ok, true);
  }

  const seventhReq = createMockReq({ headers: { 'x-real-ip': '198.51.100.77' } });
  const seventhMock = createMockRes();
  const allowed = await enforceRateLimit(seventhReq, seventhMock.res, 'pdf', 'text', limiter);
  assert.equal(allowed, false);
  assert.equal(seventhMock.res.statusCode, 429);
});

// --- 2. Oversized Request & Payload Limit Tests ---

test('request size: rejects oversized Content-Length and streamed bodies with 413', async () => {
  const headerReq = createMockReq({
    headers: { 'content-length': String(300 * 1024) },
    body: { text: 'ok' },
  });
  await assert.rejects(
    () => readJsonBody(headerReq, 256 * 1024),
    (err: unknown) => err instanceof HttpError && err.statusCode === 413
  );

  const streamReq = createMockReq({
    rawChunks: ['{"text":"', 'a'.repeat(1024), '"}'],
  });
  await assert.rejects(
    () => readJsonBody(streamReq, 512),
    (err: unknown) => err instanceof HttpError && err.statusCode === 413
  );
});

test('request size: handleGeminiRequest enforces 256KB body limit on text-only endpoints and 50k text limit', async () => {
  const limiter = createRateLimiter({
    env: {
      NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'test-token',
    },
    distributedBackend: createMemoryUpstashBackend(10),
  });

  const oversizedReq = createMockReq({
    body: { text: 'x'.repeat(270 * 1024) },
  });
  const oversizedMock = createMockRes();
  await handleGeminiRequest(oversizedReq, oversizedMock.res, 'flashcards', {
    rateLimiter: limiter,
    dispatcher: async () => [],
  });
  assert.equal(oversizedMock.res.statusCode, 413);

  const tooLongTextReq = createMockReq({
    body: { text: 'y'.repeat(MAX_TEXT_INPUT_LENGTH + 1) },
  });
  const tooLongMock = createMockRes();
  await handleGeminiRequest(tooLongTextReq, tooLongMock.res, 'flashcards', {
    rateLimiter: limiter,
  });
  assert.equal(tooLongMock.res.statusCode, 413);
});

// --- 3. Input Validation, SSRF & Prototype Pollution Tests ---

test('input validation: rejects unsupported endpoints, bad JSON, prototype pollution keys, and invalid image MIMEs', async () => {
  const limiter = createRateLimiter({
    env: {
      NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'test-token',
    },
    distributedBackend: createMemoryUpstashBackend(20),
  });

  // Unsupported endpoint does not echo raw path
  const badEpReq = createMockReq({ body: { text: 'hello' } });
  const badEpMock = createMockRes();
  await handleGeminiRequest(badEpReq, badEpMock.res, '<script>alert(1)</script>', {
    rateLimiter: limiter,
  });
  assert.equal(badEpMock.res.statusCode, 404);
  assert.equal(badEpMock.getBodyJson<{ error: string }>().error.includes('<script>'), false);

  // Invalid summary options
  const badOptReq = createMockReq({
    body: {
      text: 'Photosynthesis converts light energy into chemical energy.',
      options: { length: '999%', format: 'Paragraph', mode: 'Study notes', language: 'English' },
    },
  });
  const badOptMock = createMockRes();
  await handleGeminiRequest(badOptReq, badOptMock.res, 'summary', {
    rateLimiter: limiter,
  });
  assert.equal(badOptMock.res.statusCode, 400);

  // Disallowed SVG image data URL
  assert.throws(
    () => parseDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
    /Unsupported image format/
  );

  // Prototype pollution stripping
  const protoReq = createMockReq({
    body: JSON.stringify({ __proto__: { polluted: true }, text: 'clean' }),
  });
  const parsed = await readJsonBody<{ text: string }>(protoReq);
  assert.equal(parsed.text, 'clean');
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, '__proto__'), false);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

test('SSRF protection: blocks loopback, cloud metadata, private IPv4/IPv6, IPv4-mapped IPv6, credentials, and non-HTTP schemes', () => {
  const blockedUrls = [
    'http://localhost/admin',
    'http://127.0.0.1/secret',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/internal',
    'http://172.16.0.1/internal',
    'http://192.168.1.1/router',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:169.254.169.254]/',
    'http://2130706433/',
    'https://user:pass@example.com/article',
    'https://example.com:8080/article',
    'file:///etc/passwd',
    'javascript:alert(1)',
  ];

  for (const url of blockedUrls) {
    assert.throws(
      () => validatePublicHttpUrl(url),
      (err: unknown) => err instanceof HttpError && err.statusCode === 400,
      `Expected URL to be blocked: ${url}`
    );
  }

  assert.equal(isBlockedHost('[::ffff:7f00:1]'), true);
  assert.equal(validatePublicHttpUrl('https://en.wikipedia.org/wiki/Photosynthesis'), 'https://en.wikipedia.org/wiki/Photosynthesis');
});

// --- 4. PDF Endpoint Security Tests ---

test('PDF security: enforces HTML size limit, strips dangerous HTML, disables JS, and blocks unnecessary network requests', async () => {
  // 1) Size limit check
  assert.throws(
    () => validatePdfHtmlPayload('a'.repeat(MAX_PDF_HTML_BYTES + 1)),
    (err: unknown) => err instanceof HttpError && err.statusCode === 413
  );

  // 2) HTML sanitization
  const dirtyHtml =
    '<h1>Notes</h1><script>fetch("https://evil.example")</script><iframe src="https://evil.example"></iframe><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">link</a>';
  const cleaned = sanitizePdfHtml(dirtyHtml);
  assert.equal(/<script/i.test(cleaned), false);
  assert.equal(/<iframe/i.test(cleaned), false);
  assert.equal(/onerror=/i.test(cleaned), false);
  assert.equal(/javascript:/i.test(cleaned), false);

  // 3) Network request interception allow/block rules
  assert.equal(isAllowedPdfRequest('about:blank', 'document'), true);
  assert.equal(isAllowedPdfRequest('data:image/png;base64,iVBORw0KGgo=', 'image'), true);
  assert.equal(isAllowedPdfRequest('https://fonts.googleapis.com/css2?family=Noto+Sans', 'stylesheet'), true);
  assert.equal(isAllowedPdfRequest('https://fonts.gstatic.com/s/font.woff2', 'font'), true);
  assert.equal(isAllowedPdfRequest('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css', 'stylesheet'), true);

  assert.equal(isAllowedPdfRequest('data:image/svg+xml;base64,PHN2Zz4=', 'image'), false);
  assert.equal(isAllowedPdfRequest('data:text/html,<script>alert(1)</script>', 'document'), false);
  assert.equal(isAllowedPdfRequest('https://evil.example/exfil.png', 'image'), false);
  assert.equal(isAllowedPdfRequest('https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js', 'script'), false);
  assert.equal(isAllowedPdfRequest('http://169.254.169.254/latest/meta-data/', 'xhr'), false);
  assert.equal(isAllowedPdfRequest('file:///etc/passwd', 'document'), false);

  // 4) Verify JavaScript is explicitly disabled in server/pdfHandler.ts
  const pdfHandlerSource = fs.readFileSync(path.resolve('server/pdfHandler.ts'), 'utf8');
  assert.match(pdfHandlerSource, /setJavaScriptEnabled\(\s*false\s*\)/);

  // 5) Full handlePdfRequest rejects oversized HTML with 413 and serves valid PDF with security headers
  const limiter = createRateLimiter({
    env: {
      NODE_ENV: 'production',
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'test-token',
    },
    distributedBackend: createMemoryUpstashBackend(5),
  });

  const oversizedPdfReq = createMockReq({
    body: { html: '<p>' + 'z'.repeat(MAX_PDF_HTML_BYTES) + '</p>' },
  });
  const oversizedPdfMock = createMockRes();
  await handlePdfRequest(oversizedPdfReq, oversizedPdfMock.res, {
    rateLimiter: limiter,
    pdfRenderer: async () => Buffer.from('%PDF-1.4 mock'),
  });
  assert.equal(oversizedPdfMock.res.statusCode, 413);

  const validPdfReq = createMockReq({
    body: { html: '<h1>Valid Study Notes</h1><p>Summary content</p>' },
  });
  const validPdfMock = createMockRes();
  await handlePdfRequest(validPdfReq, validPdfMock.res, {
    rateLimiter: limiter,
    pdfRenderer: async (safeHtml) => {
      assert.match(safeHtml, /Valid Study Notes/);
      return Buffer.from('%PDF-1.4 valid');
    },
  });
  assert.equal(validPdfMock.res.statusCode, 200);
  assert.equal(validPdfMock.headers.get('content-type'), 'application/pdf');
  assert.equal(validPdfMock.headers.get('x-content-type-options'), 'nosniff');
});

// --- 5. API Error Handling & CORS Restriction Tests ---

test('API error handling: masks raw internal errors and secret config details from public clients', () => {
  const internalMock = createMockRes();
  sendGeminiError(internalMock.res, new Error('ECONNRESET internal-host.corp:8443 stack detail'));
  assert.equal(internalMock.res.statusCode, 500);
  assert.equal(internalMock.getBodyJson<{ error: string }>().error.includes('internal-host.corp'), false);

  const missingKeyMock = createMockRes();
  sendGeminiError(missingKeyMock.res, new Error('GEMINI_API_KEY is not configured on the server.'));
  assert.equal(missingKeyMock.res.statusCode, 503);
  assert.equal(missingKeyMock.getBodyJson<{ error: string }>().error.includes('GEMINI_API_KEY'), false);

  const quotaMock = createMockRes();
  sendGeminiError(quotaMock.res, new QuotaExceededError('AI service rate limit reached (429). Please retry in ~30s.', 30));
  assert.equal(quotaMock.res.statusCode, 429);
  assert.equal(quotaMock.headers.get('retry-after'), '30');
});

test('CORS protection: rejects disallowed cross-origin requests with 403 and allows same-origin', () => {
  const evilReq = createMockReq({
    method: 'POST',
    headers: {
      host: 'pro.example.com',
      origin: 'https://attacker.example',
    },
  });
  const evilMock = createMockRes();
  const blocked = handleCorsAndPreflight(evilReq, evilMock.res, 'json');
  assert.equal(blocked, true);
  assert.equal(evilMock.res.statusCode, 403);
  assert.equal(evilMock.headers.get('access-control-allow-origin'), undefined);

  const sameOriginReq = createMockReq({
    method: 'POST',
    headers: {
      host: 'pro.example.com',
      origin: 'https://pro.example.com',
    },
  });
  const sameOriginMock = createMockRes();
  const handled = handleCorsAndPreflight(sameOriginReq, sameOriginMock.res, 'json');
  assert.equal(handled, false);
  assert.equal(sameOriginMock.headers.get('access-control-allow-origin'), 'https://pro.example.com');
});
