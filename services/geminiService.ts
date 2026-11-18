import type { StudyMode, EducationalContent, DeepDiveContent } from '../types';

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

export async function generateEducationalContentFromText(
  text: string,
  mode: StudyMode,
  difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium',
  previousTopics: string[] = []
): Promise<EducationalContent> {
  return postGemini<EducationalContent>('educational-text', {
    text,
    mode,
    difficulty,
    previousTopics,
  });
}

export async function generateEducationalContentFromImage(
  images: { base64: string; mimeType: string }[],
  mode: StudyMode,
  difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium',
  additionalPrompt?: string,
  previousTopics: string[] = []
): Promise<EducationalContent> {
  return postGemini<EducationalContent>('educational-image', {
    images,
    mode,
    difficulty,
    additionalPrompt,
    previousTopics,
  });
}

export async function generateDeepDiveContentFromText(text: string): Promise<DeepDiveContent> {
  return postGemini<DeepDiveContent>('deep-dive', { text });
}

export async function generateSpeech(text: string): Promise<string> {
  return postGemini<string>('speech', { text });
}

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  return postGemini<string>('translate', { text, targetLanguage });
}
