import React, { useState } from 'react';
import { Loader2, BookOpen, ListChecks, ArrowLeft, RotateCcw, CheckCircle2, XCircle, ChevronRight, Zap, WifiOff } from 'lucide-react';
import { generateInteractiveStudy, formatGeminiErrorMessage } from '../lib/gemini';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface StudyData {
  keyPoints: string[];
  flashcards: { front: string; back: string }[];
  quiz: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }[];
}

export function InteractiveStudy() {
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [studyData, setStudyData] = useState<StudyData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  
  // Navigation State
  const [screen, setScreen] = useState<'setup' | 'home' | 'revision' | 'practice' | 'result'>('setup');
  
  // Practice State
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState<number[]>([]);
  const [showExplanation, setShowExplanation] = useState(false);

  // Flashcard State
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    if (!isOnline) {
      setErrorMessage("Interactive Study requires an internet connection.");
      return;
    }
    setErrorMessage(null);
    setIsGenerating(true);
    try {
      const data = await generateInteractiveStudy(topic);
      setStudyData(data);
      setScreen('home');
    } catch (error) {
      setErrorMessage(formatGeminiErrorMessage(error, "Failed to generate study content. Please try again."));
    } finally {
      setIsGenerating(false);
    }
  };

  const startPractice = () => {
    setCurrentQuestion(0);
    setSelectedOption(null);
    setScore(0);
    setWrongAnswers([]);
    setShowExplanation(false);
    setScreen('practice');
  };

  const handleOptionSelect = (index: number) => {
    if (selectedOption !== null || !studyData) return; // Prevent multiple selections
    
    setSelectedOption(index);
    setShowExplanation(true);
    
    const isCorrect = index === studyData.quiz[currentQuestion].correctIndex;
    if (isCorrect) {
      setScore(s => s + 1);
    } else {
      setWrongAnswers(prev => [...prev, currentQuestion]);
    }
  };

  const nextQuestion = () => {
    if (!studyData) return;
    if (currentQuestion < studyData.quiz.length - 1) {
      setCurrentQuestion(c => c + 1);
      setSelectedOption(null);
      setShowExplanation(false);
    } else {
      setScreen('result');
    }
  };

  const toggleFlashcard = (index: number) => {
    setFlippedCards(prev => ({ ...prev, [index]: !prev[index] }));
  };

  // --- Screens ---

  if (screen === 'setup') {
    return (
      <div className="max-w-md mx-auto p-6 h-full flex flex-col justify-center space-y-8">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Zap className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Study Mode</h2>
          <p className="text-gray-500">Enter a topic to generate interactive revision cards and practice quizzes.</p>
        </div>
        
        <div className="space-y-4">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Cellular Respiration, World War II..."
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-lg"
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          />
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !isOnline || !topic.trim()}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex justify-center items-center gap-2 text-lg shadow-lg shadow-blue-200"
          >
            {isGenerating ? <><Loader2 className="w-6 h-6 animate-spin" /> Generating...</> : !isOnline ? <><WifiOff className="w-5 h-5" /> Offline</> : 'Create Study Set'}
          </button>
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3 text-sm">
              {errorMessage}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'home' && studyData) {
    return (
      <div className="max-w-md mx-auto p-6 h-full flex flex-col space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <button onClick={() => setScreen('setup')} className="p-2 -ml-2 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="font-semibold text-gray-900 truncate px-4">{topic}</h2>
          <div className="w-10" /> {/* Spacer */}
        </div>

        <div className="flex-1 flex flex-col justify-center gap-6">
          <button 
            onClick={() => setScreen('revision')}
            className="group relative overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 p-8 rounded-3xl text-white shadow-xl shadow-indigo-200 transition-transform active:scale-95"
          >
            <div className="relative z-10 flex flex-col items-start text-left space-y-4">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                <BookOpen className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-1">Revise</h3>
                <p className="text-indigo-100">Key points & flashcards</p>
              </div>
            </div>
            <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-colors" />
          </button>

          <button 
            onClick={startPractice}
            className="group relative overflow-hidden bg-gradient-to-br from-emerald-400 to-teal-500 p-8 rounded-3xl text-white shadow-xl shadow-emerald-200 transition-transform active:scale-95"
          >
            <div className="relative z-10 flex flex-col items-start text-left space-y-4">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                <ListChecks className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-1">Practice</h3>
                <p className="text-emerald-100">Test your knowledge</p>
              </div>
            </div>
            <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-colors" />
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'revision' && studyData) {
    return (
      <div className="max-w-md mx-auto p-6 h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="flex items-center mb-6 sticky top-0 bg-white/80 backdrop-blur-md py-4 z-10">
          <button onClick={() => setScreen('home')} className="p-2 -ml-2 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-xl text-gray-900 ml-2">Revision</h2>
        </div>

        <div className="space-y-8 pb-24">
          <section>
            <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-4 px-1">Key Points</h3>
            <div className="space-y-3">
              {studyData.keyPoints.map((point, idx) => (
                <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 text-sm font-bold mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-gray-700 leading-relaxed">{point}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-purple-600 uppercase tracking-wider mb-4 px-1">Flashcards</h3>
            <div className="grid grid-cols-2 gap-4">
              {studyData.flashcards.map((card, idx) => (
                <div 
                  key={idx}
                  onClick={() => toggleFlashcard(idx)}
                  className="relative h-40 w-full perspective-1000 cursor-pointer group"
                >
                  <div className={`w-full h-full transition-all duration-500 transform-style-3d ${flippedCards[idx] ? 'rotate-y-180' : ''}`}>
                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-center text-center shadow-sm group-hover:border-purple-300 transition-colors">
                      <p className="font-medium text-gray-800">{card.front}</p>
                    </div>
                    {/* Back */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-purple-600 text-white rounded-2xl p-4 flex items-center justify-center text-center shadow-md">
                      <p className="font-medium">{card.back}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-gray-400 mt-4">Tap cards to flip</p>
          </section>
        </div>
      </div>
    );
  }

  if (screen === 'practice' && studyData) {
    const q = studyData.quiz[currentQuestion];
    
    return (
      <div className="max-w-md mx-auto p-6 h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => setScreen('home')} className="p-2 -ml-2 text-gray-400 hover:text-gray-600">
            <XCircle className="w-6 h-6" />
          </button>
          <div className="flex gap-1">
            {studyData.quiz.map((_, idx) => (
              <div 
                key={idx} 
                className={`h-1.5 w-6 rounded-full ${idx === currentQuestion ? 'bg-emerald-500' : idx < currentQuestion ? 'bg-emerald-200' : 'bg-gray-200'}`}
              />
            ))}
          </div>
          <span className="text-sm font-medium text-gray-500">{currentQuestion + 1}/{studyData.quiz.length}</span>
        </div>

        <div className="flex-1 flex flex-col">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 leading-tight">{q.question}</h2>

          <div className="space-y-3 flex-1">
            {q.options.map((opt, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrect = idx === q.correctIndex;
              const showStatus = selectedOption !== null;
              
              let btnClass = "w-full p-5 rounded-2xl border-2 text-left font-medium transition-all duration-200 flex justify-between items-center ";
              
              if (!showStatus) {
                btnClass += "border-gray-100 bg-white hover:border-emerald-200 hover:bg-emerald-50 text-gray-700";
              } else if (isCorrect) {
                btnClass += "border-emerald-500 bg-emerald-50 text-emerald-800";
              } else if (isSelected && !isCorrect) {
                btnClass += "border-red-500 bg-red-50 text-red-800";
              } else {
                btnClass += "border-gray-100 bg-gray-50 text-gray-400 opacity-50";
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleOptionSelect(idx)}
                  disabled={showStatus}
                  className={btnClass}
                >
                  <span>{opt}</span>
                  {showStatus && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                  {showStatus && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-red-500" />}
                </button>
              );
            })}
          </div>

          {showExplanation && (
            <div className="mt-6 p-4 bg-blue-50 rounded-2xl border border-blue-100 animate-in fade-in slide-in-from-bottom-2">
              <p className="text-sm text-blue-800"><span className="font-bold">Explanation:</span> {q.explanation}</p>
            </div>
          )}
        </div>

        <div className="pt-6 mt-auto">
          <button
            onClick={nextQuestion}
            disabled={selectedOption === null}
            className="w-full py-4 bg-gray-900 text-white rounded-2xl font-semibold hover:bg-black transition-colors disabled:opacity-20 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {currentQuestion < studyData.quiz.length - 1 ? 'Next Question' : 'See Results'}
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'result' && studyData) {
    const percentage = Math.round((score / studyData.quiz.length) * 100);
    
    return (
      <div className="max-w-md mx-auto p-6 h-full flex flex-col justify-center space-y-8 animate-in zoom-in-95 duration-500">
        <div className="text-center space-y-4">
          <div className="relative inline-flex items-center justify-center">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-gray-100" />
              <circle 
                cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent" 
                strokeDasharray={56 * 2 * Math.PI} 
                strokeDashoffset={56 * 2 * Math.PI * (1 - percentage / 100)}
                className={percentage >= 80 ? "text-emerald-500" : percentage >= 50 ? "text-yellow-500" : "text-red-500"} 
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute text-3xl font-bold text-gray-900">{percentage}%</div>
          </div>
          
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {percentage >= 80 ? 'Great Job!' : percentage >= 50 ? 'Good Effort!' : 'Keep Practicing!'}
            </h2>
            <p className="text-gray-500 mt-1">You scored {score} out of {studyData.quiz.length}</p>
          </div>
        </div>

        {wrongAnswers.length > 0 && (
          <div className="bg-red-50 p-5 rounded-3xl border border-red-100">
            <h3 className="font-bold text-red-800 mb-3">Areas to Review</h3>
            <ul className="space-y-2">
              {wrongAnswers.map((qIdx) => (
                <li key={qIdx} className="text-sm text-red-700 flex gap-2 items-start">
                  <span className="mt-0.5">•</span>
                  <span>{studyData.quiz[qIdx].question}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-3 pt-4">
          <button
            onClick={startPractice}
            className="w-full py-4 bg-gray-900 text-white rounded-2xl font-semibold hover:bg-black transition-colors flex justify-center items-center gap-2"
          >
            <RotateCcw className="w-5 h-5" /> Try Again
          </button>
          <button
            onClick={() => setScreen('home')}
            className="w-full py-4 bg-white text-gray-900 border-2 border-gray-200 rounded-2xl font-semibold hover:bg-gray-50 transition-colors"
          >
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  return null;
}
