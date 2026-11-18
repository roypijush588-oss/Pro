
export type StudyMode = 'Student' | 'KnowledgeBuilder' | 'DeepDive';

export interface LoadingState {
  status: 'idle' | 'processing' | 'success' | 'error';
  stage: string;
  progress: number;
}

export interface Question {
  question: string;
  answer?: string;
  options?: string[];
  correctAnswer?: string;
  marks?: number;
}

export interface FlashcardItem {
  question: string;
  answer: string;
}

export interface FormulaItem {
  formula: string;
  explanation: string;
}

export interface DiagramItem {
  description: string;
  mermaidCode: string;
}

export interface ExampleItem {
  title: string;
  explanation: string;
}

export interface EducationalContent {
  topicSummary: string;
  revisionNotes?: string;
  formulaExplanations?: FormulaItem[];
  flashcards?: FlashcardItem[];
  veryShortAnswerQuestions?: Question[];
  shortAnswerQuestions?: Question[];
  longAnswerQuestions?: Question[];
  multipleChoiceQuestions?: MCQ[];
}

export interface MCQ {
  question: string;
  options: string[];
  correctAnswer: string;
  category?: string;
  marks?: number;
  explanation?: string;
}

export interface DeepDiveContent {
  topic: string;
  theory: string;
  formulas?: FormulaItem[];
  diagrams?: DiagramItem[];
  examples?: ExampleItem[];
  history?: string;
  currentApplications?: string;
}

export interface CachedItem {
  id: string;
  timestamp: number;
  query: string;
  content: EducationalContent | DeepDiveContent;
  studyMode: StudyMode;
}

declare global {
  interface Window {
    MathJax: {
      typesetPromise: (elements?: (HTMLElement | null)[]) => Promise<void>;
    };
  }
}
