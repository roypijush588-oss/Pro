import express from 'express';
import path from 'path';
import { handleGeminiRequest } from './server/geminiHandler.ts';
import { handlePdfRequest } from './server/pdfHandler.ts';
import { applyApiSecurityHeaders, handleCorsAndPreflight, sendJson } from './server/httpUtils.ts';

const app = express();
const PORT = 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use('/api', (req, res, next) => {
  if (handleCorsAndPreflight(req, res, 'json')) return;
  next();
});

app.use('/api', express.json({ limit: '4mb' }));

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!err) {
    next();
    return;
  }
  const typedErr = err as { type?: string; status?: number; statusCode?: number };
  if (typedErr.type === 'entity.too.large' || typedErr.status === 413 || typedErr.statusCode === 413) {
    sendJson(res, 413, { error: 'Request payload exceeds maximum allowed size.', code: 413 });
    return;
  }
  if (typedErr instanceof SyntaxError || typedErr.type === 'entity.parse.failed' || typedErr.status === 400) {
    sendJson(res, 400, { error: 'Invalid JSON request body.', code: 400 });
    return;
  }
  console.error('Server error:', err instanceof Error ? err.message : 'Unknown error');
  sendJson(res, 500, { error: 'Internal server error.', code: 500 });
});

app.all('/api/gemini/:endpoint', async (req, res) => {
  await handleGeminiRequest(req, res, req.params.endpoint);
});

app.all('/api/generate-pdf', async (req, res) => {
  await handlePdfRequest(req, res);
});

app.all('/api/{*splat}', (_req, res) => {
  applyApiSecurityHeaders(res);
  sendJson(res, 404, { error: 'API endpoint not found.', code: 404 });
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist
    app.use(express.static('dist'));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
