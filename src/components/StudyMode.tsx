import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  Lightbulb, Type, Image as ImageIcon, Loader2, 
  Sparkles, Download, BookOpen, ChevronRight, WifiOff, Check
} from 'lucide-react';
import { generateStudyLesson, formatGeminiErrorMessage } from '../lib/gemini';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useStore } from '../store/useStore';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import html2pdf from 'html2pdf.js';

interface StudyModeProps {
  onStartPractice?: () => void;
}

export function StudyMode({ onStartPractice }: StudyModeProps) {
  const [inputType, setInputType] = useState<'text' | 'image'>('text');
  const [topic, setTopic] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lesson, setLesson] = useState<string | null>(null);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  const addNote = useStore((state) => state.addNote);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const downloadPDF = () => {
    if (!contentRef.current) return;
    const element = contentRef.current;
    const opt = {
      margin: 1,
      filename: 'study_lesson.pdf',
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in' as const, format: 'letter', orientation: 'portrait' as const }
    };
    html2pdf().set(opt).from(element).save();
  };

  const handleSaveToLibrary = () => {
    if (!lesson || savedToLibrary) return;
    const trimmedTopic = topic.trim();
    const title = trimmedTopic
      ? (trimmedTopic.length > 40 ? `${trimmedTopic.slice(0, 40)}...` : trimmedTopic)
      : 'Study Lesson';
    addNote({
      id: Date.now().toString(),
      title,
      originalText: trimmedTopic || 'Scanned Image Study Lesson',
      summary: lesson,
      date: new Date().toISOString(),
      folder: 'Study Mode',
      syncSource: 'online',
    });
    setSavedToLibrary(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!topic && !imageUrl) return;
    if (!isOnline) {
      setErrorMessage("Study Mode requires an internet connection to generate a lesson.");
      return;
    }

    setErrorMessage(null);
    setSavedToLibrary(false);
    setIsProcessing(true);
    try {
      const result = await generateStudyLesson(topic, imageUrl);
      setLesson(result || "Could not generate a lesson.");
    } catch (error: unknown) {
      console.error("Lesson generation failed:", error);
      setErrorMessage(formatGeminiErrorMessage(error, "Failed to generate lesson. Please try again."));
    } finally {
      setIsProcessing(false);
    }
  };

  if (!lesson) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-8 pb-24 md:pb-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Study Mode</h2>
          <p className="text-gray-500">Learn something new with AI-guided, structured lessons.</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-md">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setInputType('text')}
              className={`flex-1 flex justify-center items-center gap-2 py-4 text-sm font-medium transition-colors relative ${inputType === 'text' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700 bg-gray-50/50'}`}
            >
              <Type className="w-4 h-4" /> Topic
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
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What do you want to learn today? (e.g., 'Quantum Physics basics', 'How does the stock market work?')..."
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
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Add additional context or specific questions about this image (optional)..."
                    className="w-full h-24 resize-none outline-none text-gray-700 text-base bg-gray-50 border border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                )}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {!isOnline ? (
              <span className="text-xs text-amber-700 flex items-center gap-1.5">
                <WifiOff className="w-3.5 h-3.5 shrink-0" /> Internet connection required to start a new AI lesson.
              </span>
            ) : (
              <span />
            )}
            <button
              onClick={handleGenerate}
              disabled={isProcessing || !isOnline || (!topic && !imageUrl)}
              className="w-full sm:w-auto flex justify-center items-center gap-2 px-8 py-3 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Preparing Lesson...
                </>
              ) : !isOnline ? (
                <>
                  <WifiOff className="w-4 h-4" /> Offline
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Start Learning
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

  return (
    <div className="max-w-4xl mx-auto pb-24 md:pb-6">
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-gray-200 p-4 md:px-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-blue-600" />
            Study Lesson
          </h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={downloadPDF}
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
              title="Download PDF"
            >
              <Download className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setLesson(null)}
              className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              New Topic
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden"
        >
          <div className="p-6 md:p-8" ref={contentRef}>
            <div className="prose prose-blue prose-lg max-w-none text-gray-800 prose-headings:text-gray-900 prose-headings:font-bold prose-h2:text-2xl prose-h3:text-xl prose-hr:border-gray-200 prose-hr:my-8 prose-table:border-collapse prose-th:border-b-2 prose-th:border-gray-200 prose-td:border-b prose-td:border-gray-100 prose-th:text-left prose-th:py-3 prose-td:py-3 prose-li:my-1">
              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {lesson}
              </Markdown>
            </div>
          </div>
          
          <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex flex-col sm:flex-row gap-3 justify-end">
            <button
              onClick={handleSaveToLibrary}
              disabled={savedToLibrary}
              className={`flex items-center justify-center gap-2 px-6 py-2.5 border rounded-full text-sm font-medium transition-colors shadow-sm ${
                savedToLibrary
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
              }`}
            >
              {savedToLibrary ? <><Check className="w-4 h-4" /> Saved to Library</> : <><BookOpen className="w-4 h-4" /> Save to Library</>}
            </button>
            {onStartPractice && (
              <button
                onClick={onStartPractice}
                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm font-medium transition-colors shadow-sm"
              >
                Test My Knowledge <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
