import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { generateFlashcards, formatGeminiErrorMessage } from '../lib/gemini';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { BrainCircuit, Loader2, ChevronRight, ChevronLeft, RefreshCw, Download, WifiOff } from 'lucide-react';
import { motion } from 'framer-motion';
import html2pdf from 'html2pdf.js';

export function FlashcardsView() {
  const { notes, flashcardSets, addFlashcardSet } = useStore();
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentSetId, setCurrentSetId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  const downloadPDF = () => {
    if (!contentRef.current) return;
    const element = contentRef.current;
    const opt = {
      margin: 1,
      filename: 'flashcards.pdf',
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in' as const, format: 'letter', orientation: 'portrait' as const }
    };
    html2pdf().set(opt).from(element).save();
  };

  const activeSet = flashcardSets.find(s => s.id === currentSetId);

  const handleGenerate = async () => {
    if (!selectedNoteId) return;
    if (!isOnline) {
      setErrorMessage("Generating new flashcards requires an internet connection. Your existing sets remain available offline.");
      return;
    }
    const note = notes.find(n => n.id === selectedNoteId);
    if (!note) return;

    setErrorMessage(null);
    setIsGenerating(true);
    try {
      const cards = await generateFlashcards(note.summary);
      const newSet = {
        id: Date.now().toString(),
        noteId: note.id,
        title: `${note.title} Flashcards`,
        cards: cards
      };
      addFlashcardSet(newSet);
      setCurrentSetId(newSet.id);
      setCurrentCardIndex(0);
      setIsFlipped(false);
    } catch (error: unknown) {
      console.error("Failed to generate flashcards", error);
      setErrorMessage(formatGeminiErrorMessage(error, "Failed to generate flashcards."));
    } finally {
      setIsGenerating(false);
    }
  };

  const nextCard = () => {
    if (activeSet && currentCardIndex < activeSet.cards.length - 1) {
      setIsFlipped(false);
      setTimeout(() => setCurrentCardIndex(prev => prev + 1), 150);
    }
  };

  const prevCard = () => {
    if (currentCardIndex > 0) {
      setIsFlipped(false);
      setTimeout(() => setCurrentCardIndex(prev => prev - 1), 150);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 pb-24 md:pb-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BrainCircuit className="w-6 h-6 text-blue-600" />
          Flashcard Generator
        </h2>
        <p className="text-gray-600 mt-1">Convert your summaries into interactive flashcards for active recall.</p>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select a Note to Generate Flashcards</label>
            <select 
              value={selectedNoteId}
              onChange={(e) => setSelectedNoteId(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select a Note --</option>
              {notes.map(note => (
                <option key={note.id} value={note.id}>{note.title}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={!selectedNoteId || isGenerating || !isOnline}
            className="w-full md:w-auto px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : !isOnline ? <><WifiOff className="w-4 h-4" /> Offline</> : 'Generate Cards'}
          </button>
        </div>
        {!isOnline && (
          <p className="text-xs text-amber-700 flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5 shrink-0" /> Generating new flashcards requires a connection. Saved sets below work offline.
          </p>
        )}
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
          {errorMessage}
        </div>
      )}

      {flashcardSets.length > 0 && !activeSet && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Your Flashcard Sets</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {flashcardSets.map(set => (
              <div 
                key={set.id} 
                onClick={() => {
                  setCurrentSetId(set.id);
                  setCurrentCardIndex(0);
                  setIsFlipped(false);
                }}
                className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md cursor-pointer transition-shadow"
              >
                <h4 className="font-medium text-gray-900 mb-2">{set.title}</h4>
                <p className="text-sm text-gray-500">{set.cards.length} cards</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSet && (
        <div className="flex flex-col items-center pt-8" ref={contentRef}>
          <div className="w-full flex justify-between items-center mb-6">
            <button 
              onClick={() => setCurrentSetId(null)}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              ← Back to Sets
            </button>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-500">
                Card {currentCardIndex + 1} of {activeSet.cards.length}
              </span>
              <button 
                onClick={downloadPDF}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                title="Download PDF"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div 
            className="relative w-full max-w-2xl h-80 perspective-1000 cursor-pointer select-none"
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <motion.div
              className="w-full h-full relative transform-style-3d"
              style={{
                transformStyle: 'preserve-3d',
                WebkitTransformStyle: 'preserve-3d',
              }}
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.5, type: "spring", stiffness: 260, damping: 22 }}
            >
              {/* Front */}
              <div
                className="absolute inset-0 backface-hidden bg-white rounded-2xl border-2 border-blue-100 shadow-lg px-8 py-12 flex flex-col items-center justify-center text-center overflow-y-auto"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(0deg) translateZ(1px)',
                  pointerEvents: isFlipped ? 'none' : 'auto',
                }}
                aria-hidden={isFlipped}
              >
                <span className="absolute top-4 left-4 text-xs font-bold text-blue-400 uppercase tracking-widest">Question</span>
                <h3 className="text-xl sm:text-2xl font-medium text-gray-800 break-words max-w-full">{activeSet.cards[currentCardIndex].question}</h3>
                <p className="absolute bottom-4 text-sm text-gray-400 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Click to flip
                </p>
              </div>

              {/* Back */}
              <div 
                className="absolute inset-0 backface-hidden bg-blue-600 rounded-2xl shadow-lg px-8 py-12 flex flex-col items-center justify-center text-center overflow-y-auto"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg) translateZ(1px)',
                  pointerEvents: isFlipped ? 'auto' : 'none',
                }}
                aria-hidden={!isFlipped}
              >
                <span className="absolute top-4 left-4 text-xs font-bold text-blue-200 uppercase tracking-widest">Answer</span>
                <p className="text-lg sm:text-xl text-white break-words max-w-full">{activeSet.cards[currentCardIndex].answer}</p>
                <p className="absolute bottom-4 text-sm text-blue-200 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Click to flip
                </p>
              </div>
            </motion.div>
          </div>

          <div className="flex items-center gap-6 mt-8">
            <button 
              onClick={prevCard}
              disabled={currentCardIndex === 0}
              className="p-3 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button 
              onClick={nextCard}
              disabled={currentCardIndex === activeSet.cards.length - 1}
              className="p-3 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
