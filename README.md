# Pro — AI Study Companion

Pro is a Vite + React study web application with serverless/Express API routes for AI summarization, structured question generation, flashcards, quizzes, homework solving, and PDF export.

## Security Architecture

- **Server-side AI proxy**: All Gemini API calls run exclusively on the server (`/api/gemini/[endpoint]`). `GEMINI_API_KEY` is never exposed to browser bundles or client environment variables (`VITE_` / `import.meta.env`).
- **Distributed per-IP rate limiting**: All `/api/gemini/*` and `/api/generate-pdf` routes enforce sliding-window per-IP burst and hourly limits backed by Upstash Redis (`@upstash/ratelimit`). In production/Vercel, requests fail closed (`503`) if Upstash Redis is missing or unreachable—never falling back to unrestricted access.
- **Request-size & input validation**: JSON payloads are bounded per endpoint (256 KB for text-only routes, 4 MB for image routes, 512 KB for PDF requests / 400 KB max HTML), prototype-pollution keys are stripped, image MIME types are strictly allowlisted, and user-supplied URLs block private/loopback/metadata networks (IPv4 & IPv6).
- **Hardened PDF rendering**: `/api/generate-pdf` strips active HTML tags/handlers, disables JavaScript execution in headless Chromium (`page.setJavaScriptEnabled(false)`), and blocks unnecessary external network requests.
- **Origin-restricted CORS**: Cross-origin requests are restricted to same-origin hosts and explicitly configured `ALLOWED_ORIGINS` (no wildcard `*`).

## Required Environment Variables

Configure these environment variables in Vercel (**Project Settings → Environment Variables**) or in a local `.env` file (never commit `.env`):

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key used exclusively on the server (`process.env.GEMINI_API_KEY`). |
| `UPSTASH_REDIS_REST_URL` | Yes (Production) | Upstash Redis REST endpoint URL (`https://...`) for distributed rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | Yes (Production) | Upstash Redis REST token used alongside `UPSTASH_REDIS_REST_URL`. |
| `ALLOWED_ORIGINS` | Optional | Comma-separated list of additional allowed origins (e.g. `https://app.example.com`) if serving cross-origin requests. |

See `.env.example` for the exact variable template.

## Local Development & Verification

1. Copy `.env.example` to `.env` and populate your own private values locally:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server (port 3000):
   ```bash
   npm run dev
   ```
4. Run TypeScript checks, linting, tests, and production build:
   ```bash
   npx tsc --noEmit
   npm run lint
   npm test
   npm run build
   ```
