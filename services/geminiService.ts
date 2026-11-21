import type { StudyMode, EducationalContent, DeepDiveContent } from '../types';

const CLIENT_TIMEOUT_MS = 65_000;

async function postGemini<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  try {
    const response = await fetch(`/api/gemini/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let data: { result?: T; error?: string } = {};
    if (rawText) {
      try {
        data = JSON.parse(rawText) as { result?: T; error?: string };
      } catch {
        // Non-JSON response (e.g. proxy/gateway error page)
      }
    }

    if (!response.ok) {
      if (data.error) {
        throw new Error(data.error);
      }
      if (response.status === 413) {
        throw new Error('The uploaded image or text is too large. Please try a smaller file or shorter input.');
      }
      if (response.status === 504) {
        throw new Error('The server timed out while waiting for the AI response. Please try again.');
      }
      throw new Error(rawText.slice(0, 200) || `Request failed with status ${response.status}`);
    }

    return data.result as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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
