import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { generateQuiz } from '../lib/gemini';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { GraduationCap, Loader2, CheckCircle2, XCircle, Download, WifiOff } from 'lucide-react';
import html2pdf from 'html2pdf.js';

export function ExamBoosterView() {
  const { notes, quizSets, addQuizSet } = useStore();
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentSetId, setCurrentSetId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  const downloadPDF = () => {
    if (!contentRef.current) return;
    const element = contentRef.current;
    const opt = {
      margin: 1,
      filename: 'exam_booster.pdf',
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in' as const, format: 'letter', orientation: 'portrait' as const }
    };
    html2pdf().set(opt).from(element).save();
  };

  const activeSet = quizSets.find(s => s.id === currentSetId);

  const handleGenerate = async () => {
    if (!selectedNoteId) return;
    if (!isOnline) {
      setErrorMessage("Generating new quizzes requires an internet connection. Saved quizzes remain available offline.");
      return;
    }
    const note = notes.find(n => n.id === selectedNoteId);
    if (!note) return;

    setErrorMessage(null);
    setIsGenerating(true);
    try {
      const questions = await generateQuiz(note.summary);
      const newSet = {
        id: Date.now().toString(),
        noteId: note.id,
        title: `${note.title} Practice Quiz`,
        questions: questions
      };
      addQuizSet(newSet);
      setCurrentSetId(newSet.id);
      setAnswers({});
      setShowResults(false);
    } catch (error: unknown) {
      console.error("Failed to generate quiz", error);
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("429") || message.includes("quota") || message.includes("RESOURCE_EXHAUSTED")) {
        setErrorMessage("API Quota Exceeded. Please check your plan and billing details.");
      } else {
        setErrorMessage("Failed to generate quiz.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOptionSelect = (qIndex: number, option: string) => {
    if (showResults) return;
    setAnswers(prev => ({ ...prev, [qIndex]: option }));
  };

  const calculateScore = () => {
    if (!activeSet) return 0;
    let score = 0;
    activeSet.questions.forEach((q, idx) => {
      if (answers[idx] === q.correctAnswer) score++;
    });
    return score;
  };

  return (
    <div className="max-w-4xl mx-auto p-6 pb-24 md:pb-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-blue-600" />
          Exam Booster Mode
        </h2>
        <p className="text-gray-600 mt-1">Generate multiple-choice questions to test your knowledge.</p>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select a Note to Generate Quiz</label>
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
            {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : !isOnline ? <><WifiOff className="w-4 h-4" /> Offline</> : 'Generate Quiz'}
          </button>
        </div>
        {!isOnline && (
          <p className="text-xs text-amber-700 flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5 shrink-0" /> Generating new quizzes requires a connection. Saved quizzes below work offline.
          </p>
        )}
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
          {errorMessage}
        </div>
      )}

      {quizSets.length > 0 && !activeSet && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Your Practice Quizzes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quizSets.map(set => (
              <div 
                key={set.id} 
                onClick={() => {
                  setCurrentSetId(set.id);
                  setAnswers({});
                  setShowResults(false);
                }}
                className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md cursor-pointer transition-shadow"
              >
                <h4 className="font-medium text-gray-900 mb-2">{set.title}</h4>
                <p className="text-sm text-gray-500">{set.questions.length} questions</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSet && (
        <div className="space-y-8 pb-12" ref={contentRef}>
          <div className="flex justify-between items-center">
            <button 
              onClick={() => setCurrentSetId(null)}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              ← Back to Quizzes
            </button>
            <div className="flex items-center gap-4">
              <h3 className="text-xl font-bold text-gray-900">{activeSet.title}</h3>
              <button 
                onClick={downloadPDF}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                title="Download PDF"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
            <div className="w-20"></div> {/* Spacer for alignment */}
          </div>

          <div className="space-y-6">
            {activeSet.questions.map((q, qIndex) => (
              <div key={qIndex} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h4 className="text-lg font-medium text-gray-900 mb-4">
                  {qIndex + 1}. {q.question}
                </h4>
                <div className="space-y-2">
                  {q.options.map((option, oIndex) => {
                    const isSelected = answers[qIndex] === option;
                    const isCorrect = option === q.correctAnswer;
                    
                    let optionClass = "w-full text-left p-4 rounded-lg border transition-colors ";
                    
                    if (!showResults) {
                      optionClass += isSelected 
                        ? "bg-blue-50 border-blue-500 text-blue-700" 
                        : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700";
                    } else {
                      if (isCorrect) {
                        optionClass += "bg-green-50 border-green-500 text-green-800";
                      } else if (isSelected && !isCorrect) {
                        optionClass += "bg-red-50 border-red-500 text-red-800";
                      } else {
                        optionClass += "bg-white border-gray-200 text-gray-500 opacity-50";
                      }
                    }

                    return (
                      <button
                        key={oIndex}
                        onClick={() => handleOptionSelect(qIndex, option)}
                        disabled={showResults}
                        className={optionClass}
                      >
                        <div className="flex items-center justify-between">
                          <span>{option}</span>
                          {showResults && isCorrect && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                          {showResults && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-red-600" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
                
                {showResults && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Explanation:</span> {q.explanation}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {!showResults ? (
            <div className="flex justify-end">
              <button
                onClick={() => setShowResults(true)}
                disabled={Object.keys(answers).length !== activeSet.questions.length}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Submit Quiz
              </button>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
              <h3 className="text-2xl font-bold text-blue-900 mb-2">Quiz Complete!</h3>
              <p className="text-blue-700 text-lg">
                You scored <span className="font-bold">{calculateScore()}</span> out of {activeSet.questions.length}
              </p>
              <button
                onClick={() => {
                  setAnswers({});
                  setShowResults(false);
                }}
                className="mt-4 px-6 py-2 bg-white text-blue-600 border border-blue-200 rounded-lg font-medium hover:bg-blue-50 transition-colors"
              >
                Retake Quiz
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
