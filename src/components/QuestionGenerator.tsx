import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, ChevronDown, ChevronUp, Bookmark, 
  BookmarkCheck, MessageCircle, PlayCircle, Sparkles, 
  BookOpen, List, AlignLeft, AlignJustify, Type, 
  Image as ImageIcon, Loader2, CheckCircle2, Download, WifiOff
} from 'lucide-react';
import { generateStructuredQuestions, chatWithSummary, formatGeminiErrorMessage } from '../lib/gemini';
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

interface QuestionGeneratorProps {
  onStartPractice?: () => void;
}

export function QuestionGenerator({ onStartPractice }: QuestionGeneratorProps) {
  const [inputType, setInputType] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [data, setData] = useState<StructuredData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [simplerExplanations, setSimplerExplanations] = useState<Record<string, string>>({});
  const [loadingSimplerId, setLoadingSimplerId] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [savedQuestions, setSavedQuestions] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const downloadPDF = () => {
    if (!data) return;

    const container = document.createElement('div');
    container.style.padding = '40px';
    container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    container.style.color = '#1f2937';
    container.style.maxWidth = '800px';
    container.style.margin = '0 auto';

    const titleEl = document.createElement('h1');
    titleEl.style.fontSize = '32px';
    titleEl.style.fontWeight = '800';
    titleEl.style.marginBottom = '32px';
    titleEl.style.color = '#374151';
    titleEl.textContent = 'Study Notes';
    container.appendChild(titleEl);

    data.categories.forEach((category) => {
      const catHeading = document.createElement('h2');
      catHeading.style.fontSize = '24px';
      catHeading.style.fontWeight = '700';
      catHeading.style.marginTop = '40px';
      catHeading.style.marginBottom = '20px';
      catHeading.style.color = '#374151';
      catHeading.textContent = category.title;
      container.appendChild(catHeading);

      category.questions.forEach((q, index) => {
        let marks = '';
        const catTitle = category.title.toLowerCase();
        if (catTitle.includes('multiple choice') || category.id.includes('mcq')) {
          marks = '[1 Mark] ';
        } else if (catTitle.includes('very short') || category.id.includes('vsa')) {
          marks = '[1 Mark] ';
        } else if (catTitle.includes('short') || category.id.includes('sa')) {
          marks = '[2 Marks] ';
        } else if (catTitle.includes('long') || category.id.includes('la')) {
          marks = '[5 Marks] ';
        } else {
          if (q.difficulty === 'Easy') marks = '[1 Mark] ';
          else if (q.difficulty === 'Medium') marks = '[2 Marks] ';
          else if (q.difficulty === 'Hard') marks = '[5 Marks] ';
        }

        const block = document.createElement('div');
        block.style.marginBottom = '28px';
        block.style.pageBreakInside = 'avoid';

        const questionP = document.createElement('p');
        questionP.style.fontWeight = '600';
        questionP.style.marginBottom = '12px';
        questionP.style.fontSize = '16px';
        questionP.style.lineHeight = '1.5';
        questionP.style.color = '#374151';
        questionP.textContent = `Q${index + 1}: ${marks}${q.text}`;
        block.appendChild(questionP);

        if (q.options && q.options.length > 0) {
          const list = document.createElement('ul');
          list.style.marginBottom = '16px';
          list.style.paddingLeft = '24px';
          list.style.listStyleType = 'disc';
          list.style.lineHeight = '1.6';
          list.style.color = '#374151';
          q.options.forEach((opt) => {
            const li = document.createElement('li');
            li.style.marginBottom = '6px';
            li.textContent = opt;
            list.appendChild(li);
          });
          block.appendChild(list);

          const ansLabel = document.createElement('p');
          ansLabel.style.fontStyle = 'italic';
          ansLabel.style.marginBottom = '8px';
          ansLabel.style.color = '#4b5563';
          ansLabel.textContent = 'Correct Answer:';
          block.appendChild(ansLabel);
        } else {
          const ansLabel = document.createElement('p');
          ansLabel.style.fontWeight = '700';
          ansLabel.style.marginBottom = '8px';
          ansLabel.style.color = '#374151';
          ansLabel.textContent = 'A:';
          block.appendChild(ansLabel);
        }

        container.appendChild(block);
      });
    });

    const opt = {
      margin: 0.5,
      filename: 'study_notes.pdf',
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in' as const, format: 'letter', orientation: 'portrait' as const },
    };

    html2pdf().set(opt).from(container).save();
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
      setErrorMessage("Question Generator requires an internet connection.");
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);
    try {
      const result = await generateStructuredQuestions(text, imageUrl);
      if (result) {
        try {
          const parsed = JSON.parse(result) as StructuredData;
          setData(parsed);
          if (parsed.categories.length > 0) {
            setExpandedCategory(parsed.categories[0].id);
          }
        } catch (parseError) {
          console.error("JSON Parse Error:", parseError, "Raw Result:", result);
          setErrorMessage("The AI generated an invalid response. This often happens if you ask for too many questions at once. Try asking for fewer questions.");
        }
      }
    } catch (error: unknown) {
      console.error("Generation failed:", error);
      setErrorMessage(formatGeminiErrorMessage(error, "Failed to generate questions. Please try again."));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExplainSimpler = async (q: Question) => {
    if (!isOnline) {
      setSimplerExplanations(prev => ({
        ...prev,
        [q.id]: 'Internet connection required to generate a simpler explanation.'
      }));
      return;
    }
    setLoadingSimplerId(q.id);
    try {
      const reply = await chatWithSummary(
        `Question: ${q.text}\nAnswer: ${q.answer}\nExplanation: ${q.explanation}`,
        'Explain this question and answer in very simple, beginner-friendly terms in 2-4 sentences.'
      );
      setSimplerExplanations(prev => ({ ...prev, [q.id]: reply }));
    } catch {
      setSimplerExplanations(prev => ({
        ...prev,
        [q.id]: 'Could not simplify right now. Please try again.'
      }));
    } finally {
      setLoadingSimplerId(null);
    }
  };

  const handleGenerateMore = async () => {
    if (!isOnline || isGeneratingMore || (!text && !imageUrl)) return;
    setIsGeneratingMore(true);
    setErrorMessage(null);
    try {
      const result = await generateStructuredQuestions(
        `${text || 'From the uploaded image'}\n\nGenerate a fresh set of additional unique questions different from earlier ones.`,
        imageUrl
      );
      if (result) {
        const parsed = JSON.parse(result) as StructuredData;
        setData(prev => {
          if (!prev) return parsed;
          const merged = prev.categories.map(cat => {
            const incoming = parsed.categories.find(c => c.id === cat.id || c.title === cat.title);
            if (!incoming) return cat;
            const stamped = incoming.questions.map((q, idx) => ({
              ...q,
              id: `${q.id}-more-${Date.now()}-${idx}`
            }));
            return { ...cat, questions: [...cat.questions, ...stamped] };
          });
          return { categories: merged };
        });
      }
    } catch (error: unknown) {
      setErrorMessage(formatGeminiErrorMessage(error, 'Failed to generate additional questions. Please try again.'));
    } finally {
      setIsGeneratingMore(false);
    }
  };

  const toggleSave = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSaved = new Set(savedQuestions);
    if (newSaved.has(id)) {
      newSaved.delete(id);
    } else {
      newSaved.add(id);
    }
    setSavedQuestions(newSaved);
  };

  const getCategoryIcon = (id: string) => {
    if (id.includes('mcq')) return <List className="w-5 h-5" />;
    if (id.includes('vsa')) return <Type className="w-5 h-5" />;
    if (id.includes('sa')) return <AlignLeft className="w-5 h-5" />;
    return <AlignJustify className="w-5 h-5" />;
  };

  const getDifficultyColor = (diff: string) => {
    switch (diff.toLowerCase()) {
      case 'easy': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'hard': return 'text-rose-600 bg-rose-50 border-rose-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const filteredCategories = data?.categories.map(cat => ({
    ...cat,
    questions: cat.questions.filter(q => {
      const matchesSearch = q.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            q.topic.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = activeFilter === 'All' || q.difficulty === activeFilter;
      return matchesSearch && matchesFilter;
    })
  })).filter(cat => cat.questions.length > 0) || [];

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-8 pb-24 md:pb-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Question Generator</h2>
          <p className="text-gray-500">Generate structured, high-quality questions from any topic or image.</p>
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
                <WifiOff className="w-3.5 h-3.5 shrink-0" /> Internet connection required to generate questions.
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
                  <Sparkles className="w-4 h-4" /> Generate Questions
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
      {/* Header & Search Section */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-gray-200 p-4 md:px-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              Question Bank
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
                onClick={() => setData(null)}
                className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                New Topic
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text"
                placeholder="Search questions or topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-gray-400"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
              {['All', 'Easy', 'Medium', 'Hard'].map(filter => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all border ${
                    activeFilter === filter 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 md:p-8 space-y-6" ref={contentRef}>
        {filteredCategories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No questions found matching your criteria.</p>
          </div>
        ) : (
          filteredCategories.map((category) => (
            <div key={category.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => setExpandedCategory(expandedCategory === category.id ? null : category.id)}
                className="w-full flex items-center justify-between p-5 bg-white hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    {getCategoryIcon(category.id)}
                  </div>
                  <h3 className="font-semibold text-lg text-gray-900">{category.title}</h3>
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-medium">
                    {category.questions.length}
                  </span>
                </div>
                {expandedCategory === category.id ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              <AnimatePresence>
                {expandedCategory === category.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 pt-0 space-y-3 bg-gray-50">
                      {category.questions.map((q, idx) => (
                        <div key={q.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          <button
                            onClick={() => setExpandedQuestion(expandedQuestion === q.id ? null : q.id)}
                            className="w-full text-left p-4 hover:bg-gray-50 transition-colors flex gap-4"
                          >
                            <span className="text-gray-400 font-mono text-sm mt-0.5">{idx + 1}.</span>
                            <div className="flex-1 space-y-2">
                              <p className="text-gray-800 font-medium leading-relaxed">{q.text}</p>
                              
                              {/* Options for MCQ */}
                              {q.options && q.options.length > 0 && !expandedQuestion?.includes(q.id) && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                                  {q.options.map((opt, i) => (
                                    <div key={i} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-600">
                                      {String.fromCharCode(65 + i)}. {opt}
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center gap-3 pt-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getDifficultyColor(q.difficulty)}`}>
                                  {q.difficulty}
                                </span>
                                <span className="text-xs text-gray-500">{q.topic}</span>
                              </div>
                            </div>
                          </button>

                          <AnimatePresence>
                            {expandedQuestion === q.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden border-t border-gray-100 bg-gray-50/50"
                              >
                                <div className="p-4 pl-12 space-y-4">
                                  {/* Options for MCQ (Expanded) */}
                                  {q.options && q.options.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                                      {q.options.map((opt, i) => {
                                        const isCorrect = opt === q.answer || `${String.fromCharCode(65 + i)}. ${opt}` === q.answer;
                                        return (
                                          <div key={i} className={`px-3 py-2 rounded-lg border text-sm flex items-center justify-between ${
                                            isCorrect 
                                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                                              : 'bg-white border-gray-200 text-gray-600'
                                          }`}>
                                            <span>{String.fromCharCode(65 + i)}. {opt}</span>
                                            {isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  <div className="space-y-3">
                                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                                      <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Answer</h4>
                                      <div className="prose prose-blue prose-sm max-w-none text-gray-700">
                                        <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                          {q.answer}
                                        </Markdown>
                                      </div>
                                    </div>
                                    
                                    <div className="bg-white border border-gray-100 rounded-xl p-4">
                                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Explanation</h4>
                                      <div className="prose prose-sm max-w-none text-gray-600">
                                        <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                          {q.explanation}
                                        </Markdown>
                                      </div>
                                    </div>
                                  </div>

                                  {simplerExplanations[q.id] && (
                                    <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4">
                                      <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">Simpler Explanation</h4>
                                      <p className="text-sm text-gray-700 leading-relaxed">{simplerExplanations[q.id]}</p>
                                    </div>
                                  )}

                                  <div className="flex flex-wrap gap-2 pt-2">
                                    <button
                                      onClick={() => handleExplainSimpler(q)}
                                      disabled={loadingSimplerId === q.id}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                      {loadingSimplerId === q.id ? 'Simplifying...' : 'Explain Simpler'}
                                    </button>
                                    {onStartPractice && (
                                      <button
                                        onClick={onStartPractice}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition-colors"
                                      >
                                        <PlayCircle className="w-3.5 h-3.5" /> Practice This
                                      </button>
                                    )}
                                    <div className="flex-1" />
                                    <button 
                                      onClick={(e) => toggleSave(q.id, e)}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                        savedQuestions.has(q.id) 
                                          ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' 
                                          : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                      }`}
                                    >
                                      {savedQuestions.has(q.id) ? (
                                        <><BookmarkCheck className="w-3.5 h-3.5" /> Saved</>
                                      ) : (
                                        <><Bookmark className="w-3.5 h-3.5" /> Save</>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3 text-sm">
            {errorMessage}
          </div>
        )}

        {/* AI Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-6 border-t border-gray-200">
          <button
            onClick={handleGenerateMore}
            disabled={isGeneratingMore || !isOnline}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            {isGeneratingMore ? (
              <><Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Generating More...</>
            ) : !isOnline ? (
              <><WifiOff className="w-4 h-4 text-amber-600" /> Offline</>
            ) : (
              <><Sparkles className="w-4 h-4 text-blue-600" /> Generate More Questions</>
            )}
          </button>
          {onStartPractice && (
            <button
              onClick={onStartPractice}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
            >
              <PlayCircle className="w-4 h-4" /> Start Practice Mode
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
