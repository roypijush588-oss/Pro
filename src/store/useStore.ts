import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SummaryOptions } from '../lib/gemini';

export interface Note {
  id: string;
  title: string;
  originalText: string;
  summary: string;
  date: string;
  folder: string;
  syncSource?: 'online' | 'synced';
}

export interface QueuedSummary {
  id: string;
  text: string;
  url: string;
  options: SummaryOptions;
  createdAt: string;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
}

export interface FlashcardSet {
  id: string;
  noteId: string;
  title: string;
  cards: Flashcard[];
}

export interface MCQ {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface QuizSet {
  id: string;
  noteId: string;
  title: string;
  questions: MCQ[];
}

interface AppState {
  notes: Note[];
  flashcardSets: FlashcardSet[];
  quizSets: QuizSet[];
  pendingSummaries: QueuedSummary[];
  addNote: (note: Note) => void;
  updateNote: (id: string, summary: string) => void;
  deleteNote: (id: string) => void;
  addFlashcardSet: (flashcardSet: FlashcardSet) => void;
  addQuizSet: (quizSet: QuizSet) => void;
  enqueueSummary: (item: Omit<QueuedSummary, 'id' | 'createdAt' | 'status'>) => void;
  updateQueuedSummaryStatus: (
    id: string,
    status: QueuedSummary['status'],
    error?: string
  ) => void;
  removeQueuedSummary: (id: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      notes: [],
      flashcardSets: [],
      quizSets: [],
      pendingSummaries: [],
      addNote: (note) => set((state) => ({ notes: [note, ...state.notes] })),
      updateNote: (id, summary) =>
        set((state) => ({
          notes: state.notes.map((n) => (n.id === id ? { ...n, summary } : n)),
        })),
      deleteNote: (id) =>
        set((state) => ({ notes: state.notes.filter((n) => n.id !== id) })),
      addFlashcardSet: (flashcardSet) =>
        set((state) => ({ flashcardSets: [flashcardSet, ...state.flashcardSets] })),
      addQuizSet: (quizSet) =>
        set((state) => ({ quizSets: [quizSet, ...state.quizSets] })),
      enqueueSummary: (item) =>
        set((state) => ({
          pendingSummaries: [
            ...state.pendingSummaries,
            {
              ...item,
              id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              createdAt: new Date().toISOString(),
              status: 'pending',
            },
          ],
        })),
      updateQueuedSummaryStatus: (id, status, error) =>
        set((state) => ({
          pendingSummaries: state.pendingSummaries.map((q) =>
            q.id === id ? { ...q, status, error } : q
          ),
        })),
      removeQueuedSummary: (id) =>
        set((state) => ({
          pendingSummaries: state.pendingSummaries.filter((q) => q.id !== id),
        })),
    }),
    {
      name: 'ai-summary-storage',
    }
  )
);
