import express from 'express';
import cors from 'cors';
import path from 'path';
import { handleGeminiRequest } from './server/geminiHandler.ts';
import { handlePdfRequest } from './server/pdfHandler.ts';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.all('/api/gemini/:endpoint', async (req, res) => {
  await handleGeminiRequest(req, res, req.params.endpoint);
});

app.all('/api/generate-pdf', async (req, res) => {
  await handlePdfRequest(req, res);
});

app.all('/api/{*splat}', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
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
