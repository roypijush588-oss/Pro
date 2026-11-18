export interface SummaryOptions {
  length: string; // '25%', '50%', '75%'
  format: string; // 'Paragraph', 'Bullet points'
  mode: string; // 'Simple explanation', 'Study notes', 'Key points only', 'Exam revision mode'
  language: string;
}

async function postGemini<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/gemini/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }
  return data.result as T;
}

export async function generateSummary(text: string, options: SummaryOptions, imageUrl?: string, url?: string) {
  return postGemini<string>('summary', { text, options, imageUrl, url });
}

export async function generateFlashcards(text: string) {
  return postGemini<{ id: string; question: string; answer: string }[]>('flashcards', { text });
}

export async function generateQuiz(text: string) {
  return postGemini<{
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  }[]>('quiz', { text });
}

export async function generateInteractiveStudy(topic: string) {
  return postGemini<{
    keyPoints: string[];
    flashcards: { front: string; back: string }[];
    quiz: {
      question: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }[];
  }>('interactive-study', { topic });
}

export async function solveHomework(text: string, imageUrl?: string) {
  return postGemini<string>('homework', { text, imageUrl });
}

export async function createNotes(text: string, imageUrl?: string) {
  return postGemini<string>('notes', { text, imageUrl });
}

export async function generateQuestions(text: string, imageUrl?: string) {
  return postGemini<string>('questions', { text, imageUrl });
}

export async function generateRevisionContent(text: string, imageUrl?: string) {
  return postGemini<string>('revision', { text, imageUrl });
}

export async function generatePractice(text: string, imageUrl?: string) {
  return postGemini<string>('practice', { text, imageUrl });
}

export async function generateStructuredPractice(text: string, imageUrl?: string) {
  return postGemini<string>('structured-practice', { text, imageUrl });
}

export async function generateStructuredQuestions(text: string, imageUrl?: string) {
  return postGemini<string>('structured-questions', { text, imageUrl });
}

export async function analyzePerformance(topic: string, correct: string, wrong: string) {
  return postGemini<string>('analyze-performance', { topic, correct, wrong });
}

export async function generateStudyLesson(topic: string, imageUrl?: string) {
  return postGemini<string>('study-lesson', { topic, imageUrl });
}

export async function chatWithSummary(summary: string, question: string) {
  return postGemini<string>('chat-summary', { summary, question });
}
