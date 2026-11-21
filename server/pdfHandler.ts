import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser } from 'puppeteer-core';
import {
  ApiRequest,
  ApiResponse,
  HttpError,
  handlePreflight,
  isBlockedHost,
  readJsonBody,
  sendText,
} from './httpUtils.ts';

const PDF_TIMEOUT_MS = 45_000;

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
          path.join(base, version, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
          path.join(base, version, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
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

function isAllowedSubresourceUrl(rawUrl: string): boolean {
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('about:')) {
    return true;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return !isBlockedHost(parsed.hostname);
  } catch {
    return false;
  }
}

export async function generatePdfBufferFromHtml(html: string): Promise<Buffer> {
  let browser: Browser | undefined;
  try {
    browser = await launchPdfBrowser();
    const page = await browser.newPage();
    page.setDefaultTimeout(PDF_TIMEOUT_MS);

    await page.setRequestInterception(true);
    page.on('request', (interceptedRequest) => {
      if (isAllowedSubresourceUrl(interceptedRequest.url())) {
        interceptedRequest.continue();
      } else {
        interceptedRequest.abort('blockedbyclient');
      }
    });

    await page.setContent(html, {
      waitUntil: 'load',
      timeout: PDF_TIMEOUT_MS,
    });
    await page.evaluate(() => document.fonts?.ready).catch(() => {});

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

export async function handlePdfRequest(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    sendText(res, 405, 'Method not allowed. Use POST.');
    return;
  }

  let browserError: unknown;
  try {
    const body = await readJsonBody<{ html?: unknown }>(req);
    const html = body.html;

    if (typeof html !== 'string' || !html.trim()) {
      sendText(res, 400, 'HTML content is required');
      return;
    }

    const pdfBuffer = await generatePdfBufferFromHtml(html);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="questions.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
    return;
  } catch (error) {
    browserError = error;
  }

  console.error('PDF Generation Error:', browserError);
  if (browserError instanceof HttpError) {
    sendText(res, browserError.statusCode, browserError.message);
    return;
  }

  const message = browserError instanceof Error ? browserError.message : 'Failed to generate PDF';
  if (message.toLowerCase().includes('timeout')) {
    sendText(res, 504, 'PDF generation timed out');
    return;
  }
  sendText(res, 500, 'Failed to generate PDF');
}
