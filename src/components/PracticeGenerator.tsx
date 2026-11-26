import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Type, Image as ImageIcon, Loader2, CheckCircle2, ListChecks, XCircle, ArrowRight, RotateCcw, Trophy, X, Download, WifiOff
} from 'lucide-react';
import { generateStructuredPractice, formatGeminiErrorMessage } from '../lib/gemini';
import { prepareImageDataUrl } from '../lib/imageUtils';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import html2pdf from 'html2pdf.js';

interface Question {
  id: string;
  text: string;
  options?: string[];
  answer: string;
  explanation: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  topic: string;
}

interface Category {
  id: string;
  title: string;
  questions: Question[];
}

interface StructuredData {
  categories: Category[];
}

export function PracticeGenerator() {
  const [inputType, setInputType] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  
  // Practice Session State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const downloadPDF = () => {
    if (!contentRef.current) return;
    const element = contentRef.current;
    const opt = {
      margin: 1,
      filename: 'practice_session.pdf',
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in' as const, format: 'letter', orientation: 'portrait' as const }
    };
    html2pdf().set(opt).from(element).save();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMessage(null);
    try {
      const prepared = await prepareImageDataUrl(file);
      setImageUrl(prepared);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load the selected image.');
    }
  };

  const handleGenerate = async () => {
    if (!text && !imageUrl) return;
    if (!isOnline) {
      setErrorMessage("Practice Generator requires an internet connection.");
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);
    try {
      const result = await generateStructuredPractice(text, imageUrl);
      if (result) {
        try {
          const parsed = JSON.parse(result) as StructuredData;
          const allQuestions = parsed.categories.flatMap(c => c.questions);
          if (allQuestions.length > 0) {
            setQuestions(allQuestions);
            setCurrentIndex(0);
            setUserAnswer('');
            setIsSubmitted(false);
            setScore(0);
            setIsFinished(false);
          } else {
            setErrorMessage("No questions could be generated. Please try a different topic.");
          }
        } catch (parseError) {
          console.error("JSON Parse Error:", parseError, "Raw Result:", result);
          setErrorMessage("The AI generated an invalid response. This often happens if you ask for too many questions at once. Try asking for fewer questions.");
        }
      }
    } catch (error: unknown) {
      console.error("Generation failed:", error);
      setErrorMessage(formatGeminiErrorMessage(error, "Failed to generate practice questions. Please try again."));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOptionSelect = (option: string) => {
    if (isSubmitted) return;
    setUserAnswer(option);
  };

  const handleSubmit = () => {
    if (!userAnswer.trim()) return;
    setIsSubmitted(true);
    
    const currentQ = questions[currentIndex];
    const isCorrect = currentQ.options && currentQ.options.length > 0 
      ? (userAnswer === currentQ.answer || currentQ.answer.includes(userAnswer))
      : false; // For subjective, we don't auto-score currently, or we can just count it as practice.

    if (isCorrect) {
      setScore(prev => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setUserAnswer('');
      setIsSubmitted(false);
    } else {
      setIsFinished(true);
    }
  };

  const handleQuit = () => {
    setConfirmQuit(true);
  };

  if (questions.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-8 pb-24 md:pb-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Practice Generator</h2>
          <p className="text-gray-500">Generate a focused practice session with MCQs and short answers. Test your knowledge step-by-step.</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-md">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setInputType('text')}
              className={`flex-1 flex justify-center items-center gap-2 py-4 text-sm font-medium transition-colors relative ${inputType === 'text' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700 bg-gray-50/50'}`}
            >
              <Type className="w-4 h-4" /> Text Topic
              {inputType === 'text' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
            </button>
            <button
              onClick={() => setInputType('image')}
              className={`flex-1 flex justify-center items-center gap-2 py-4 text-sm font-medium transition-colors relative border-l border-gray-100 ${inputType === 'image' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700 bg-gray-50/50'}`}
            >
              <ImageIcon className="w-4 h-4" /> Scan Image
              {inputType === 'image' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
            </button>
          </div>

          <div className="p-6">
            {inputType === 'text' ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter a topic (e.g., 'Cell Division', 'World War II')..."
                className="w-full h-64 resize-none outline-none text-gray-700 text-lg placeholder:text-gray-300"
              />
            ) : (
              <div className="space-y-4">
                <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => !imageUrl && fileInputRef.current?.click()}>
                  {imageUrl ? (
                    <div className="relative w-full h-full p-2">
                      <img src={imageUrl} alt="Uploaded" className="w-full h-full object-contain rounded-xl" />
                      <button 
                        onClick={(e) => { e.stopPropagation(); setImageUrl(''); }}
                        className="absolute top-4 right-4 bg-gray-900/70 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-gray-900 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                        <ImageIcon className="w-8 h-8" />
                      </div>
                      <p className="text-gray-600 font-medium">Click to upload image or scan</p>
                      <p className="text-sm text-gray-400 mt-1">Supports JPG, PNG</p>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImageUpload} 
                        accept="image/*" 
                        className="hidden" 
                      />
                    </>
                  )}
                </div>
                {imageUrl && (
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Add additional instructions or context (optional)..."
                    className="w-full h-24 resize-none outline-none text-gray-700 text-base bg-gray-50 border border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                )}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {!isOnline ? (
              <span className="text-xs text-amber-700 flex items-center gap-1.5">
                <WifiOff className="w-3.5 h-3.5 shrink-0" /> Internet connection required to generate practice sessions.
              </span>
            ) : (
              <span />
            )}
            <button
              onClick={handleGenerate}
              disabled={isProcessing || !isOnline || (!text && !imageUrl)}
              className="w-full sm:w-auto flex justify-center items-center gap-2 px-8 py-3 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Generating...
                </>
              ) : !isOnline ? (
                <>
                  <WifiOff className="w-4 h-4" /> Offline
                </>
              ) : (
                <>
                  <ListChecks className="w-4 h-4" /> Start Practice
                </>
              )}
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3 text-sm">
            {errorMessage}
          </div>
        )}
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-8 flex flex-col items-center justify-center min-h-[80vh]">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm text-center w-full"
        >
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-10 h-10 text-blue-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Practice Complete!</h2>
          <p className="text-gray-500 mb-8">You&apos;ve finished all the questions in this session.</p>
          
          <div className="bg-gray-50 rounded-2xl p-6 mb-8">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Your Score</div>
            <div className="text-5xl font-black text-blue-600">
              {score} <span className="text-2xl text-gray-400">/ {questions.filter(q => q.options && q.options.length > 0).length}</span>
            </div>
            <p className="text-sm text-gray-500 mt-2">MCQs only</p>
          </div>

          <button
            onClick={() => {
              setQuestions([]);
              setText('');
              setImageUrl('');
            }}
            className="w-full flex justify-center items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <RotateCcw className="w-5 h-5" /> Start New Practice
          </button>
        </motion.div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 pb-24 md:pb-6 min-h-screen flex flex-col" ref={contentRef}>
      {/* Header & Progress */}
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={handleQuit}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Quit practice session"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="text-sm font-medium text-gray-500">
          Question {currentIndex + 1} of {questions.length}
        </div>
        <button 
          onClick={downloadPDF}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          title="Download PDF"
        >
          <Download className="w-5 h-5" />
        </button>
      </div>

      {confirmQuit && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3 text-sm text-amber-900">
          <span>Quit this practice session?</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setConfirmQuit(false);
                setQuestions([]);
              }}
              className="px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700"
            >
              Quit
            </button>
            <button
              onClick={() => setConfirmQuit(false)}
              className="px-3 py-1 bg-white border border-amber-200 text-amber-900 rounded-lg text-xs font-medium hover:bg-amber-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="w-full bg-gray-100 rounded-full h-2 mb-8 overflow-hidden">
        <motion.div 
          className="bg-blue-600 h-2 rounded-full"
          initial={{ width: `${(currentIndex / questions.length) * 100}%` }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Question Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ.id}
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -20, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex-1 flex flex-col"
        >
          <div className="bg-white border border-gray-200 rounded-3xl p-6 md:p-8 shadow-sm mb-6">
            <div className="flex items-center gap-3 mb-4">
              <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${
                currentQ.difficulty === 'Easy' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
                currentQ.difficulty === 'Medium' ? 'text-amber-600 bg-amber-50 border-amber-200' :
                'text-rose-600 bg-rose-50 border-rose-200'
              }`}>
                {currentQ.difficulty}
              </span>
              <span className="text-sm text-gray-500 font-medium">{currentQ.topic}</span>
            </div>
            
            <h3 className="text-xl md:text-2xl font-semibold text-gray-900 leading-relaxed mb-8">
              {currentQ.text}
            </h3>

            {currentQ.options && currentQ.options.length > 0 ? (
              <div className="space-y-3">
                {currentQ.options.map((opt, i) => {
                  const isSelected = userAnswer === opt;
                  const isCorrect = opt === currentQ.answer || `${String.fromCharCode(65 + i)}. ${opt}` === currentQ.answer || currentQ.answer.includes(opt);
                  
                  let optionClass = 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300';
                  
                  if (isSubmitted) {
                    if (isCorrect) {
                      optionClass = 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-1 ring-emerald-500';
                    } else if (isSelected && !isCorrect) {
                      optionClass = 'bg-rose-50 border-rose-500 text-rose-800 ring-1 ring-rose-500';
                    } else {
                      optionClass = 'bg-gray-50 border-gray-200 text-gray-400 opacity-60';
                    }
                  } else if (isSelected) {
                    optionClass = 'bg-blue-50 border-blue-500 text-blue-800 ring-1 ring-blue-500';
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => handleOptionSelect(opt)}
                      disabled={isSubmitted}
                      className={`w-full text-left px-5 py-4 rounded-2xl border-2 transition-all duration-200 flex items-center justify-between group ${optionClass}`}
                    >
                      <div className="flex items-center gap-4">
                        <span className={`flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${
                          isSubmitted && isCorrect ? 'bg-emerald-200 text-emerald-800' :
                          isSubmitted && isSelected && !isCorrect ? 'bg-rose-200 text-rose-800' :
                          isSelected ? 'bg-blue-200 text-blue-800' :
                          'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
                        }`}>
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="font-medium">{opt}</span>
                      </div>
                      {isSubmitted && isCorrect && <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
                      {isSubmitted && isSelected && !isCorrect && <XCircle className="w-6 h-6 text-rose-500" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mb-4">
                <textarea
                  value={userAnswer}
                  onChange={(e) => {
                    if(!isSubmitted) setUserAnswer(e.target.value);
                  }}
                  disabled={isSubmitted}
                  placeholder="Type your answer here..."
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all disabled:opacity-70 resize-none h-32"
                />
              </div>
            )}
          </div>

          <AnimatePresence>
            {isSubmitted && (
              <motion.div
                initial={{ height: 0, opacity: 0, y: 20 }}
                animate={{ height: 'auto', opacity: 1, y: 0 }}
                className="bg-blue-50/50 border border-blue-100 rounded-3xl p-6 md:p-8 shadow-sm mb-6"
              >
                <h4 className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-3">Explanation</h4>
                <div className="prose prose-blue max-w-none text-gray-700">
                  <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {currentQ.explanation}
                  </Markdown>
                </div>
                {(!currentQ.options || currentQ.options.length === 0) && (
                  <div className="mt-6 pt-6 border-t border-blue-100">
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Model Answer</h4>
                    <div className="prose prose-sm max-w-none text-gray-600">
                      <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {currentQ.answer}
                      </Markdown>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-auto pt-4 flex justify-end">
            {!isSubmitted ? (
              <button
                onClick={handleSubmit}
                disabled={!userAnswer.trim()}
                className="w-full sm:w-auto px-8 py-4 bg-gray-900 text-white rounded-2xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm text-lg"
              >
                Submit Answer
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-2xl font-medium hover:bg-blue-700 transition-colors shadow-sm text-lg"
              >
                {currentIndex < questions.length - 1 ? (
                  <>Next Question <ArrowRight className="w-5 h-5" /></>
                ) : (
                  'Finish Practice'
                )}
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
