import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import type { StudyMode, EducationalContent, DeepDiveContent } from "../types.ts";

const TEXT_MODEL = "gemini-4-hydrogen";
const TTS_MODEL = "gemini-3.8-flash-lite-tts";

function getAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 1): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isTransient =
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("500") ||
        msg.includes("ECONNRESET") ||
        msg.includes("fetch failed");
      if (!isTransient || attempt === maxRetries) {
        throw error;
      }
      const delayMs = 600 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function parseDataUrl(imageUrl: string): { data: string; mimeType: string } {
  const commaIdx = imageUrl.indexOf(",");
  if (commaIdx === -1) {
    throw new Error("Invalid image data URL.");
  }
  const header = imageUrl.slice(0, commaIdx);
  const data = imageUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/^data:([^;]+)/);
  const mimeType = mimeMatch?.[1] || "image/png";
  return { data, mimeType };
}

function cleanJsonResponse(raw: string): string {
  let textResponse = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (textResponse.startsWith("{")) {
    const lastBrace = textResponse.lastIndexOf("}");
    if (lastBrace !== -1 && lastBrace < textResponse.length - 1) {
      textResponse = textResponse.substring(0, lastBrace + 1);
    }
  } else if (textResponse.startsWith("[")) {
    const lastBracket = textResponse.lastIndexOf("]");
    if (lastBracket !== -1 && lastBracket < textResponse.length - 1) {
      textResponse = textResponse.substring(0, lastBracket + 1);
    }
  }
  return textResponse;
}

const BASE_SYSTEM_PROMPT = `You are an AI-powered student assistant inside a modern mobile app.
Your goal: Deliver exactly what the user asks for with a clean, minimal, and professional experience — like a premium summary app.

Core Principles:
1. Primary First: Always give the main result the user asked for. Do NOT delay or hide the main result.
2. Minimal Output: Avoid unnecessary information. Keep content clean, structured, and easy to read. Use cards/sections instead of long paragraphs.
3. Smart Suggestions (Non-intrusive): After the main result, suggest at most 2-3 helpful actions (e.g., Practice similar questions, Revise topic). Suggestions must NOT interrupt the main result.
4. Professional Learning UX: Never reveal answers before user interaction (for practice mode). Explanations should be hidden until needed. Encourage thinking before showing solutions.
5. Gender-Neutral Language: Use "they", "the student", or neutral terms. Avoid he/she or gender-specific phrases.
6. UI Awareness: Output must be designed for clickable, card-based UI. Keep sections clearly separated. Keep text short and scannable.
7. Tone: Clear, student-friendly, encouraging but not childish, professional and concise.`;

export interface SummaryOptions {
  length: string;
  format: string;
  mode: string;
  language: string;
}

export async function generateSummary(
  text: string,
  options: SummaryOptions,
  imageUrl?: string,
  url?: string
): Promise<string> {
  const ai = getAI();
  let prompt = `${BASE_SYSTEM_PROMPT}

Task: Summarize the provided content based on the following preferences:
- Length: Approximately ${options.length} of the original content.
- Format: ${options.format}
- Style/Mode: ${options.mode}
- Output Language: ${options.language}

Ensure the summary is clear, accurate, and captures the core message.`;

  let contents:
    | string
    | { parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] };

  if (url) {
    prompt += `\n\nSummarize the content from this URL: ${url}`;
    contents = prompt;
  } else if (imageUrl) {
    const { data, mimeType } = parseDataUrl(imageUrl);
    contents = {
      parts: [
        { text: prompt + `\n\nSummarize the text found in this image.` },
        { inlineData: { data, mimeType } },
      ],
    };
  } else {
    contents = prompt + `\n\nContent to summarize:\n${text}`;
  }

  const config: { tools?: { urlContext: Record<string, never> }[] } = {};
  if (url) {
    config.tools = [{ urlContext: {} }];
  }

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents,
    config,
  }));

  return response.text ?? "";
}

export async function generateFlashcards(text: string) {
  const ai = getAI();
  const prompt = `Generate 5-10 flashcards based on the following text. 
Return ONLY a JSON array of objects, where each object has a "question" and an "answer" property.`;

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt + `\n\nText:\n${text}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            answer: { type: Type.STRING },
          },
          required: ["question", "answer"],
        },
      },
    },
  }));

  const cards = JSON.parse(cleanJsonResponse(response.text || "[]")) as Array<{
    question: string;
    answer: string;
  }>;
  return cards.map((card, index) => ({
    id: `card-${Date.now()}-${index}`,
    question: card.question,
    answer: card.answer,
  }));
}

export async function generateQuiz(text: string) {
  const ai = getAI();
  const prompt = `Generate a 5-question multiple choice quiz based on the following text.
Return ONLY a JSON array of objects. Each object must have:
- "question" (string)
- "options" (array of 4 strings)
- "correctAnswer" (string, must exactly match one of the options)
- "explanation" (string, explaining why it's correct)`;

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt + `\n\nText:\n${text}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING },
          },
          required: ["question", "options", "correctAnswer", "explanation"],
        },
      },
    },
  }));

  return JSON.parse(cleanJsonResponse(response.text || "[]"));
}

export async function generateInteractiveStudy(topic: string) {
  const ai = getAI();
  const prompt = `${BASE_SYSTEM_PROMPT}

Task: Create an interactive study set for the topic "${topic}".
Return ONLY JSON with:
- "keyPoints": array of 5 concise key points (strings)
- "flashcards": array of 4-6 flashcards, each with "front" and "back" (strings)
- "quiz": array of 5 multiple-choice questions, each with "question" (string), "options" (array of 4 strings), "correctIndex" (integer 0-3), and "explanation" (string)`;

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          keyPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          flashcards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                front: { type: Type.STRING },
                back: { type: Type.STRING },
              },
              required: ["front", "back"],
            },
          },
          quiz: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING },
              },
              required: ["question", "options", "correctIndex", "explanation"],
            },
          },
        },
        required: ["keyPoints", "flashcards", "quiz"],
      },
    },
  }));

  return JSON.parse(cleanJsonResponse(response.text || "{}"));
}

export async function solveHomework(text: string, imageUrl?: string): Promise<string> {
  const ai = getAI();
  const prompt = `${BASE_SYSTEM_PROMPT}

Task: Solve the user's homework question from text or extracted image input. Detect the subject automatically.

Output Structure (Strict):
- Final Answer
- Step-by-step Solution (clean, optional style)
- Short Explanation

Rules:
- Keep explanations simple (like teaching a student).
- Avoid unnecessary complexity.
- If it's a theory question, give a well-structured answer.
- If it's math, show all steps clearly.
- If the question is unclear, ask for clarification.`;

  let contents:
    | string
    | { parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] };

  if (imageUrl) {
    const { data, mimeType } = parseDataUrl(imageUrl);
    contents = {
      parts: [
        { text: prompt + `\n\nUser Question:\n${text}` },
        { inlineData: { data, mimeType } },
      ],
    };
  } else {
    contents = prompt + `\n\nUser Question:\n${text}`;
  }

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents,
  }));

  return response.text ?? "";
}

export async function createNotes(text: string, imageUrl?: string): Promise<string> {
  const ai = getAI();
  const prompt = `${BASE_SYSTEM_PROMPT}

Task: Convert the given content into clean, structured notes.

Output Structure (Strict):
- Title
- Key Points
- Structured Notes
- Quick Revision

Rules:
- Keep language simple and easy to understand
- Use bullet points and clear formatting
- Do not include unnecessary information
- Make notes suitable for exam preparation`;

  let contents:
    | string
    | { parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] };

  if (imageUrl) {
    const { data, mimeType } = parseDataUrl(imageUrl);
    contents = {
      parts: [
        { text: prompt + `\n\nUser Input:\n${text}` },
        { inlineData: { data, mimeType } },
      ],
    };
  } else {
    contents = prompt + `\n\nUser Input:\n${text}`;
  }

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents,
  }));

  return response.text ?? "";
}

export async function generateQuestions(text: string, imageUrl?: string): Promise<string> {
  const ai = getAI();
  const prompt = `${BASE_SYSTEM_PROMPT}

Task: Generate practice questions based on the provided content.

Output Structure (Strict):
### Multiple Choice Questions (MCQ)
(Provide 3-5 MCQs with 4 options each. Highlight the correct answer.)

### Very Short Answer Questions (VSA)
(Provide 3-5 very short answer questions with brief 1-2 sentence answers.)

### Long Answer Questions (LA)
(Provide 2-3 long answer/essay questions with detailed step-by-step or comprehensive answers.)

Rules:
- Ensure the questions accurately reflect the provided content.
- Keep the formatting clean and easy to read.
- Clearly separate the questions and answers.`;

  let contents:
    | string
    | { parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] };

  if (imageUrl) {
    const { data, mimeType } = parseDataUrl(imageUrl);
    contents = {
      parts: [
        { text: prompt + `\n\nContent:\n${text}` },
        { inlineData: { data, mimeType } },
      ],
    };
  } else {
    contents = prompt + `\n\nContent:\n${text}`;
  }

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents,
  }));

  return response.text ?? "";
}

export async function generateRevisionContent(text: string, imageUrl?: string): Promise<string> {
  const ai = getAI();
  const prompt = `${BASE_SYSTEM_PROMPT}

Task: Create quick revision content from the given topic.

Output Structure (Strict):
- Key Points
- Important Facts
- Flashcards (Q → A)

Rules:
- Keep it concise
- Focus on exam revision
- Avoid long explanations`;

  let contents:
    | string
    | { parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] };

  if (imageUrl) {
    const { data, mimeType } = parseDataUrl(imageUrl);
    contents = {
      parts: [
        { text: prompt + `\n\nTopic:\n${text}` },
        { inlineData: { data, mimeType } },
      ],
    };
  } else {
    contents = prompt + `\n\nTopic:\n${text}`;
  }

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents,
  }));

  return response.text ?? "";
}

export async function generatePractice(text: string, imageUrl?: string): Promise<string> {
  const ai = getAI();
  const prompt = `${BASE_SYSTEM_PROMPT}

Task: Generate a mix of questions from the given topic.

Output Structure (Strict):
- MCQs
- Short answer questions
- Fill in the blanks

Also include:
- Answers
- Step-by-step explanations

Rules:
- Keep it concise and well-structured
- Focus on exam revision
- Clearly separate questions from answers`;

  let contents:
    | string
    | { parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] };

  if (imageUrl) {
    const { data, mimeType } = parseDataUrl(imageUrl);
    contents = {
      parts: [
        { text: prompt + `\n\nTopic:\n${text}` },
        { inlineData: { data, mimeType } },
      ],
    };
  } else {
    contents = prompt + `\n\nTopic:\n${text}`;
  }

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents,
  }));

  return response.text ?? "";
}

export async function generateStructuredPractice(text: string, imageUrl?: string): Promise<string> {
  const ai = getAI();
  const prompt = `${BASE_SYSTEM_PROMPT}

Task: Generate a structured JSON response containing practice questions based on the user's request.

IMPORTANT INSTRUCTIONS:
1. Read the user's request carefully.
2. If the user asks for a specific number of questions (e.g., "100 questions", "10 questions"), you MUST generate exactly that many questions.
3. If the user asks for specific types of questions (e.g., "MCQs only", "no short answers"), you MUST strictly follow their instructions and only generate the requested categories.

If the user does not specify the types of questions, default to these categories:
1. Multiple Choice Questions
2. Short Answer Questions
3. Fill in the Blanks

Output Structure (Strict for Practice):
- Question
- 4 Options (A, B, C, D) (for MCQs)
- Correct Answer (hidden until user submits)
- Explanation (hidden until user submits)

JSON Schema:
{
  "categories": [
    {
      "id": "string (e.g., 'mcq', 'sa', 'fib')",
      "title": "string (Category Title)",
      "questions": [
        {
          "id": "string (unique id)",
          "text": "string (Question text. Do NOT expose the correct answer here)",
          "options": ["string", "string", "string", "string"], // EXACTLY 4 options for MCQ, otherwise empty array
          "answer": "string (Correct answer)",
          "explanation": "string (Step-by-step explanation)",
          "difficulty": "Easy" | "Medium" | "Hard",
          "topic": "string (Specific sub-topic)"
        }
      ]
    }
  ]
}

Rules:
- If the user does not specify the number of questions, generate at least 3 questions per category.
- For MCQs, provide exactly 4 options (A, B, C, D). Keep options similar in length to avoid clues.
- Do NOT expose the correct answer in the question text.
- Keep answers separate from question content.
- Use gender-neutral language.
- Ensure the output is valid JSON.`;

  let contents:
    | string
    | { parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] };

  if (imageUrl) {
    const { data, mimeType } = parseDataUrl(imageUrl);
    contents = {
      parts: [
        { text: prompt + `\n\nTopic/Content:\n${text}` },
        { inlineData: { data, mimeType } },
      ],
    };
  } else {
    contents = prompt + `\n\nTopic/Content:\n${text}`;
  }

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
    },
  }));

  return cleanJsonResponse(response.text || "");
}

export async function generateStructuredQuestions(text: string, imageUrl?: string): Promise<string> {
  const ai = getAI();
  const prompt = `${BASE_SYSTEM_PROMPT}

Task: Generate a structured JSON response containing study questions based on the user's request.

IMPORTANT INSTRUCTIONS:
1. Read the user's request carefully.
2. If the user asks for a specific number of questions (e.g., "100 questions", "10 questions"), you MUST generate exactly that many questions.
3. If the user asks for specific types of questions (e.g., "MCQs only", "no long answers"), you MUST strictly follow their instructions and only generate the requested categories.

If the user does not specify the types of questions, default to these categories:
1. Very Short Answer Questions
2. Short Answer Questions
3. Long Answer Questions
4. Multiple Choice Questions

If the user does not specify the number of questions, generate at least 3 questions per category.

JSON Schema:
{
  "categories": [
    {
      "id": "string (e.g., 'mcq', 'vsa', 'sa', 'la')",
      "title": "string (Category Title)",
      "questions": [
        {
          "id": "string (unique id)",
          "text": "string (Question text)",
          "options": ["string"] // Only include for MCQ, otherwise omit or empty array
          "answer": "string (Correct answer)",
          "explanation": "string (Step-by-step explanation)",
          "difficulty": "Easy" | "Medium" | "Hard",
          "topic": "string (Specific sub-topic)"
        }
      ]
    }
  ]
}

Ensure the output is valid JSON.`;

  let contents:
    | string
    | { parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] };

  if (imageUrl) {
    const { data, mimeType } = parseDataUrl(imageUrl);
    contents = {
      parts: [
        { text: prompt + `\n\nTopic/Content:\n${text}` },
        { inlineData: { data, mimeType } },
      ],
    };
  } else {
    contents = prompt + `\n\nTopic/Content:\n${text}`;
  }

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
    },
  }));

  return cleanJsonResponse(response.text || "");
}

export async function analyzePerformance(
  topic: string,
  correct: string,
  wrong: string
): Promise<string> {
  const ai = getAI();
  const prompt = `You are an AI student performance analyzer.

Analyze the student's performance.

Input:
- Topic: ${topic}
- Correct answers: ${correct}
- Wrong answers: ${wrong}

Output:
- Score percentage
- Weak areas
- सुझाव (Suggestions) for improvement
- What to revise next

Rules:
- Keep it constructive and encouraging
- Provide actionable advice
- Format clearly using Markdown`;

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
  }));

  return response.text ?? "";
}

export async function generateStudyLesson(topic: string, imageUrl?: string): Promise<string> {
  const ai = getAI();
  const prompt = `${BASE_SYSTEM_PROMPT}

Task: Create a comprehensive, highly structured study lesson on the given topic, formatted EXACTLY like a premium textbook chapter.

Structure the lesson with the following sections, using the exact emojis and formatting:
1. 🔹 **1.1 Introduction**: A clear explanation of the topic.
2. 🔹 **1.2 Key Concepts & Definitions**: Break down main ideas. Use bullet points. Use Markdown tables if comparing things or listing properties.
3. 🔹 **1.3 Important Formulas / Rules**: (If applicable to the topic) Present in a clean Markdown table.
4. 🔹 **1.4 Applications & Limitations**: Use ✅ for applications/pros and ❌ for limitations/cons.
5. 🧩 **1.5 Solved Examples**: Provide step-by-step examples. Use ✅ to mark the final answer or conclusion.
6. 🧠 **1.6 Practice / Previous Questions**: Provide a few sample questions (like MCQ or short answer) with solutions. Use ✅ for the correct answer.

Formatting Rules:
- Use Markdown formatting extensively.
- Use horizontal rules (---) between major sections to separate them cleanly.
- Use LaTeX formatting ($...$ or $$...$$) for math equations.
- Keep the tone academic but accessible.
- Make it look exactly like a high-quality digital study guide.`;

  let contents:
    | string
    | { parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] };

  if (imageUrl) {
    const { data, mimeType } = parseDataUrl(imageUrl);
    contents = {
      parts: [
        { text: prompt + `\n\nTopic/Content to learn:\n${topic}` },
        { inlineData: { data, mimeType } },
      ],
    };
  } else {
    contents = prompt + `\n\nTopic/Content to learn:\n${topic}`;
  }

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents,
  }));

  return response.text ?? "";
}

export async function chatWithSummary(summary: string, question: string): Promise<string> {
  const ai = getAI();
  const chat = ai.chats.create({
    model: TEXT_MODEL,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction: `You are a helpful study assistant. Answer the user's questions based primarily on the following summary context. If the answer is not in the context, use your general knowledge but mention that it's not explicitly in the summary.\n\nContext Summary:\n${summary}`,
    },
  });

  const response = await withRetry(() => chat.sendMessage({ message: question }));
  return response.text ?? "";
}

const educationalContentSchema = {
  type: Type.OBJECT,
  properties: {
    topicSummary: { type: Type.STRING },
    revisionNotes: { type: Type.STRING },
    formulaExplanations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          formula: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
      },
    },
    flashcards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
        },
      },
    },
    veryShortAnswerQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
        },
      },
    },
    shortAnswerQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
        },
      },
    },
    longAnswerQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
        },
      },
    },
    multipleChoiceQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctAnswer: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
      },
    },
  },
};

const deepDiveContentSchema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING },
    theory: { type: Type.STRING },
    formulas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          formula: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
      },
    },
    diagrams: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          mermaidCode: { type: Type.STRING },
        },
      },
    },
    examples: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
      },
    },
    history: { type: Type.STRING },
    currentApplications: { type: Type.STRING },
  },
};

const EDUSCAN_SYSTEM_INSTRUCTION = `You are EduScanAI, an AI academic assistant for students. Your primary goal is to follow the user's instructions exactly. Rules: 1. Carefully read the entire user request before generating content. 2. Follow every instruction strictly. 3. Never ignore language, format, or topic requirements. 4. Take as much time as necessary to generate a complete response. 5. Do not stop until the task is fully completed. 6. Organize output using headings, bullet points, and numbering. 7. Ensure the response is clean and suitable for PDF generation. Before writing the final answer: Step 1: Identify all user requirements (topic, language, format, marks, chapter). Step 2: Plan the response structure. Step 3: Generate the complete content. Step 4: Verify that all instructions are satisfied. Only output the final structured result.`;

export async function generateEducationalContentFromText(
  text: string,
  mode: StudyMode,
  difficulty: "Easy" | "Medium" | "Hard" = "Medium",
  previousTopics: string[] = []
): Promise<EducationalContent> {
  const ai = getAI();
  const uniquenessPrompt = `
Generate a new UNIQUE set of questions.
Important:
- Do NOT repeat previous questions
- Cover different concepts each time
- Ensure infinite variety
${previousTopics.length > 0 ? `\nPrevious topics covered:\n${previousTopics.join("\n")}` : ""}
Generate fresh questions now.
`;

  const prompt = `Generate educational content for the following text. Mode: ${mode}. Difficulty: ${difficulty}. ${uniquenessPrompt} Return JSON.`;

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: { parts: [{ text: `${prompt}\n\n${text}` }] },
    config: {
      systemInstruction: EDUSCAN_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: educationalContentSchema,
    },
  }));

  const jsonText = cleanJsonResponse(response.text || "{}");
  return JSON.parse(jsonText);
}

export async function generateEducationalContentFromImage(
  images: { base64: string; mimeType: string }[],
  mode: StudyMode,
  difficulty: "Easy" | "Medium" | "Hard" = "Medium",
  additionalPrompt?: string,
  previousTopics: string[] = []
): Promise<EducationalContent> {
  const ai = getAI();
  const uniquenessPrompt = `
Generate a new UNIQUE set of questions.
Important:
- Do NOT repeat previous questions
- Cover different concepts each time
- Ensure infinite variety
${previousTopics.length > 0 ? `\nPrevious topics covered:\n${previousTopics.join("\n")}` : ""}
Generate fresh questions now.
`;

  let prompt = `Analyze these images and generate educational content. Mode: ${mode}. Difficulty: ${difficulty}. ${uniquenessPrompt} Return JSON.`;

  if (additionalPrompt && additionalPrompt.trim() !== "") {
    prompt += `\n\nUser Instructions: ${additionalPrompt}`;
  }

  const imageParts = images.map((img) => ({
    inlineData: { mimeType: img.mimeType, data: img.base64 },
  }));

  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: {
      parts: [...imageParts, { text: prompt }],
    },
    config: {
      systemInstruction: EDUSCAN_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: educationalContentSchema,
    },
  }));

  const jsonText = cleanJsonResponse(response.text || "{}");
  return JSON.parse(jsonText);
}

export async function generateDeepDiveContentFromText(text: string): Promise<DeepDiveContent> {
  const ai = getAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: {
      parts: [
        {
          text: `Provide a deep dive explanation for the following topic: ${text}. Include theory, formulas, mermaid diagrams, examples, history, and applications. Return JSON.`,
        },
      ],
    },
    config: {
      systemInstruction: EDUSCAN_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: deepDiveContentSchema,
    },
  }));

  const jsonText = cleanJsonResponse(response.text || "{}");
  return JSON.parse(jsonText);
}

export async function generateSpeech(text: string): Promise<string> {
  const ai = getAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: TTS_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text }],
      },
    ],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" },
        },
      },
    },
  }));

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
  if (!base64Audio) return "";

  const audioBuf = Buffer.from(base64Audio, "base64");
  if (audioBuf.length > 44 && audioBuf.subarray(0, 4).toString("ascii") === "RIFF") {
    return audioBuf.subarray(44).toString("base64");
  }
  return base64Audio;
}

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  const ai = getAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: `Translate to ${targetLanguage}: ${text}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  }));

  return response.text?.trim() || "";
}
