import express from 'express';
import cors from 'cors';
import path from 'path';
import puppeteer from 'puppeteer';
import {
  generateSummary,
  generateFlashcards,
  generateQuiz,
  generateInteractiveStudy,
  solveHomework,
  createNotes,
  generateQuestions,
  generateRevisionContent,
  generatePractice,
  generateStructuredPractice,
  generateStructuredQuestions,
  analyzePerformance,
  generateStudyLesson,
  chatWithSummary,
  generateEducationalContentFromText,
  generateEducationalContentFromImage,
  generateDeepDiveContentFromText,
  generateSpeech,
  translateText,
} from './server/gemini.ts';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

function sendGeminiError(res: express.Response, error: unknown) {
  console.error('Gemini API Error:', error);
  const message = error instanceof Error ? error.message : 'Gemini API request failed.';
  const statusMatch = message.match(/\b(400|401|403|404|429|500|503)\b/);
  const status =
    message.includes('RESOURCE_EXHAUSTED') || message.includes('429')
      ? 429
      : message.includes('PERMISSION_DENIED') || message.includes('403')
        ? 403
        : message.includes('API_KEY_INVALID') || message.includes('400')
          ? 400
          : message.includes('NOT_FOUND') || message.includes('404')
            ? 404
            : statusMatch
              ? Number(statusMatch[1])
              : 500;
  res.status(status).json({ error: message });
}

app.post('/api/gemini/summary', async (req, res) => {
  try {
    const { text = '', options, imageUrl, url } = req.body;
    const result = await generateSummary(text, options, imageUrl, url);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/flashcards', async (req, res) => {
  try {
    const { text = '' } = req.body;
    const result = await generateFlashcards(text);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/quiz', async (req, res) => {
  try {
    const { text = '' } = req.body;
    const result = await generateQuiz(text);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/interactive-study', async (req, res) => {
  try {
    const { topic = '' } = req.body;
    const result = await generateInteractiveStudy(topic);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/homework', async (req, res) => {
  try {
    const { text = '', imageUrl } = req.body;
    const result = await solveHomework(text, imageUrl);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/notes', async (req, res) => {
  try {
    const { text = '', imageUrl } = req.body;
    const result = await createNotes(text, imageUrl);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/questions', async (req, res) => {
  try {
    const { text = '', imageUrl } = req.body;
    const result = await generateQuestions(text, imageUrl);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/revision', async (req, res) => {
  try {
    const { text = '', imageUrl } = req.body;
    const result = await generateRevisionContent(text, imageUrl);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/practice', async (req, res) => {
  try {
    const { text = '', imageUrl } = req.body;
    const result = await generatePractice(text, imageUrl);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/structured-practice', async (req, res) => {
  try {
    const { text = '', imageUrl } = req.body;
    const result = await generateStructuredPractice(text, imageUrl);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/structured-questions', async (req, res) => {
  try {
    const { text = '', imageUrl } = req.body;
    const result = await generateStructuredQuestions(text, imageUrl);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/analyze-performance', async (req, res) => {
  try {
    const { topic = '', correct = '', wrong = '' } = req.body;
    const result = await analyzePerformance(topic, correct, wrong);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/study-lesson', async (req, res) => {
  try {
    const { topic = '', imageUrl } = req.body;
    const result = await generateStudyLesson(topic, imageUrl);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/chat-summary', async (req, res) => {
  try {
    const { summary = '', question = '' } = req.body;
    const result = await chatWithSummary(summary, question);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/educational-text', async (req, res) => {
  try {
    const { text = '', mode, difficulty, previousTopics } = req.body;
    const result = await generateEducationalContentFromText(text, mode, difficulty, previousTopics);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/educational-image', async (req, res) => {
  try {
    const { images = [], mode, difficulty, additionalPrompt, previousTopics } = req.body;
    const result = await generateEducationalContentFromImage(
      images,
      mode,
      difficulty,
      additionalPrompt,
      previousTopics
    );
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/deep-dive', async (req, res) => {
  try {
    const { text = '' } = req.body;
    const result = await generateDeepDiveContentFromText(text);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/speech', async (req, res) => {
  try {
    const { text = '' } = req.body;
    const result = await generateSpeech(text);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

app.post('/api/gemini/translate', async (req, res) => {
  try {
    const { text = '', targetLanguage = '' } = req.body;
    const result = await translateText(text, targetLanguage);
    res.json({ result });
  } catch (error) {
    sendGeminiError(res, error);
  }
});

// API Route for PDF Generation
app.post('/api/generate-pdf', async (req, res) => {
  const { html } = req.body;

  if (!html) {
    return res.status(400).send('HTML content is required');
  }

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for some container environments
    });
    const page = await browser.newPage();
    
    // Set content and wait for network idle to ensure styles/images load if any (though base64 images are safer)
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px',
      },
    });

    await browser.close();

    // Set headers for download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="questions.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(Buffer.from(pdfBuffer));

  } catch (error) {
    console.error('PDF Generation Error:', error);
    res.status(500).send('Failed to generate PDF');
  }
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
