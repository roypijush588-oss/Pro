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
  syncSource?: 'online' | 'synced' | 'local';
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

export interface PendingSummary {
  id: string;
  text: string;
  url: string;
  options: SummaryOptions;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
}

interface AppState {
  notes: Note[];
  flashcardSets: FlashcardSet[];
  quizSets: QuizSet[];
  pendingSummaries: PendingSummary[];
  addNote: (note: Note) => void;
  updateNote: (id: string, summary: string) => void;
  deleteNote: (id: string) => void;
  addFlashcardSet: (set: FlashcardSet) => void;
  addQuizSet: (set: QuizSet) => void;
  enqueueSummary: (item: Omit<PendingSummary, 'id' | 'status'>) => void;
  updateQueuedSummaryStatus: (id: string, status: PendingSummary['status'], error?: string) => void;
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
      deleteNote: (id) => set((state) => ({ notes: state.notes.filter(n => n.id !== id) })),
      addFlashcardSet: (flashcardSet) => set((state) => ({ flashcardSets: [flashcardSet, ...state.flashcardSets] })),
      addQuizSet: (quizSet) => set((state) => ({ quizSets: [quizSet, ...state.quizSets] })),
      enqueueSummary: (item) =>
        set((state) => ({
          pendingSummaries: [
            ...state.pendingSummaries,
            {
              ...item,
              id: Date.now().toString(),
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
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<AppState>;
        return {
          ...currentState,
          ...persisted,
          notes: Array.isArray(persisted.notes) ? persisted.notes : [],
          flashcardSets: Array.isArray(persisted.flashcardSets) ? persisted.flashcardSets : [],
          quizSets: Array.isArray(persisted.quizSets) ? persisted.quizSets : [],
          pendingSummaries: Array.isArray(persisted.pendingSummaries) ? persisted.pendingSummaries : [],
        };
      },
    }
  )
);
