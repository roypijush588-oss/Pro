import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser } from 'puppeteer-core';
import type { ApiRequest, ApiResponse } from './httpUtils.ts';
import {
  HttpError,
  MAX_PDF_BODY_BYTES,
  applyApiSecurityHeaders,
  handleCorsAndPreflight,
  isBlockedHost,
  readJsonBody,
  sendText,
} from './httpUtils.ts';
import { enforceRateLimit } from './rateLimiter.ts';

const PDF_TIMEOUT_MS = 45_000;
export const MAX_PDF_HTML_BYTES = 400 * 1024; // 400 KB max HTML input

const SAFE_DATA_IMAGE_MIME_PREFIXES = [
  'data:image/png;',
  'data:image/jpeg;',
  'data:image/jpg;',
  'data:image/webp;',
  'data:image/gif;',
  'data:font/',
  'data:text/css;',
];

function findCachedPuppeteerChrome(): string | undefined {
  const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer');
  const subdirs = ['chrome', 'chrome-headless-shell'];

  for (const subdir of subdirs) {
    const base = path.join(cacheDir, subdir);
    if (!fs.existsSync(base)) continue;
    try {
      const versions = fs.readdirSync(base);
      for (const version of versions) {
        const candidates = [
          path.join(base, version, 'chrome-linux64', 'chrome'),
          path.join(base, version, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
          path.join(
            base,
            version,
            'chrome-mac-arm64',
            'Google Chrome for Testing.app',
            'Contents',
            'MacOS',
            'Google Chrome for Testing'
          ),
          path.join(
            base,
            version,
            'chrome-mac-x64',
            'Google Chrome for Testing.app',
            'Contents',
            'MacOS',
            'Google Chrome for Testing'
          ),
        ];
        for (const candidate of candidates) {
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        }
      }
    } catch {
      // Ignore unreadable cache entries
    }
  }
  return undefined;
}

function findLocalSystemChrome(): string | undefined {
  const envPath =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() ||
    process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const cached = findCachedPuppeteerChrome();
  if (cached) return cached;

  const systemCandidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return systemCandidates.find((candidate) => fs.existsSync(candidate));
}

async function launchPdfBrowser(): Promise<Browser> {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    const executablePath = await chromium.executablePath();
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath,
      headless: true,
    });
  }

  const localPath = findLocalSystemChrome();
  if (localPath) {
    return puppeteer.launch({
      executablePath: localPath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  const fallbackPath = await chromium.executablePath();
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath: fallbackPath,
    headless: true,
  });
}

export function sanitizePdfHtml(rawHtml: string): string {
  return rawHtml
    // Strip active script/embed/frame elements
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*>/gi, '')
    .replace(/<(iframe|frame|frameset|object|embed|applet|base)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|frame|frameset|object|embed|applet|base)\b[^>]*\/?>/gi, '')
    // Strip meta refresh / CSP overrides
    .replace(/<meta\b[^>]*http-equiv\s*=[^>]*>/gi, '')
    // Strip inline event handlers
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Neutralize javascript:/vbscript:/data:text/html links & sources
    .replace(/(href|src|action|formaction)\s*=\s*(["'])\s*(?:javascript|vbscript|data\s*:\s*text\/html):[\s\S]*?\2/gi, '$1="#"');
}

export function isAllowedPdfRequest(rawUrl: string, resourceType: string): boolean {
  if (rawUrl === 'about:blank' && resourceType === 'document') {
    return true;
  }

  const lower = rawUrl.toLowerCase();

  // Only allow safe inline raster images, CSS, or fonts via data: URLs (no SVG, HTML, or JS)
  if (lower.startsWith('data:')) {
    if (
      (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') &&
      SAFE_DATA_IMAGE_MIME_PREFIXES.some((prefix) => lower.startsWith(prefix))
    ) {
      return true;
    }
    return false;
  }

  // Block all other non-HTTP schemes (file:, blob:, ws:, ftp:, chrome:, etc.)
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:' || isBlockedHost(parsed.hostname)) {
    return false;
  }

  const host = parsed.hostname.toLowerCase();

  // Allow only read-only font/math stylesheet assets used by legitimate PDF templates
  if (host === 'fonts.googleapis.com' && resourceType === 'stylesheet') {
    return true;
  }
  if (host === 'fonts.gstatic.com' && resourceType === 'font') {
    return true;
  }
  if (
    host === 'cdn.jsdelivr.net' &&
    parsed.pathname.startsWith('/npm/katex@') &&
    (resourceType === 'stylesheet' || resourceType === 'font')
  ) {
    return true;
  }

  // Block all unnecessary external network requests (scripts, images, XHR/fetch, tracking, subframes, etc.)
  return false;
}

export function validatePdfHtmlPayload(html: unknown): string {
  if (typeof html !== 'string' || !html.trim()) {
    throw new HttpError(400, 'HTML content is required.');
  }
  if (Buffer.byteLength(html, 'utf8') > MAX_PDF_HTML_BYTES) {
    throw new HttpError(413, 'HTML content exceeds the maximum allowed PDF size of 400 KB.');
  }
  return sanitizePdfHtml(html);
}

export async function generatePdfBufferFromHtml(html: string): Promise<Buffer> {
  const safeHtml = validatePdfHtmlPayload(html);
  let browser: Browser | undefined;
  try {
    browser = await launchPdfBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(PDF_TIMEOUT_MS);

    // Strictly disable JavaScript execution in headless Chromium
    await page.setJavaScriptEnabled(false);

    await page.setRequestInterception(true);
    page.on('request', (interceptedRequest) => {
      if (isAllowedPdfRequest(interceptedRequest.url(), interceptedRequest.resourceType())) {
        interceptedRequest.continue();
      } else {
        interceptedRequest.abort('blockedbyclient');
      }
    });

    await page.setContent(safeHtml, {
      waitUntil: 'load',
      timeout: PDF_TIMEOUT_MS,
    });

    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px',
      },
    });

    return Buffer.from(pdfBytes);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export async function handlePdfRequest(
  req: ApiRequest,
  res: ApiResponse,
  options?: {
    rateLimiter?: Parameters<typeof enforceRateLimit>[4];
    pdfRenderer?: (html: string) => Promise<Buffer>;
  }
): Promise<void> {
  if (handleCorsAndPreflight(req, res, 'text')) return;

  if (req.method !== 'POST') {
    sendText(res, 405, 'Method not allowed. Use POST.');
    return;
  }

  const allowed = await enforceRateLimit(req, res, 'pdf', 'text', options?.rateLimiter);
  if (!allowed) return;

  let browserError: unknown;
  try {
    const body = await readJsonBody<{ html?: unknown }>(req, MAX_PDF_BODY_BYTES);
    const safeHtml = validatePdfHtmlPayload(body.html);
    const renderPdf = options?.pdfRenderer ?? generatePdfBufferFromHtml;
    const pdfBuffer = await renderPdf(safeHtml);

    applyApiSecurityHeaders(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="questions.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
    return;
  } catch (error) {
    browserError = error;
  }

  console.error(
    'PDF Generation Error:',
    browserError instanceof Error ? browserError.message : 'Unknown error'
  );
  if (browserError instanceof HttpError) {
    sendText(res, browserError.statusCode, browserError.message);
    return;
  }

  const message = browserError instanceof Error ? browserError.message : '';
  if (message.toLowerCase().includes('timeout')) {
    sendText(res, 504, 'PDF generation timed out.');
    return;
  }
  sendText(res, 500, 'Failed to generate PDF.');
}
