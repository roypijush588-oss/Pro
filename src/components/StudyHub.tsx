import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Filter, ChevronDown, Bookmark, 
  Play, Sparkles, List, AlignLeft, FileText, 
  CheckSquare, Zap, BrainCircuit, RefreshCw,
  BookOpen
} from 'lucide-react';

interface Question {
  id: string;
  q: string;
  a: string;
  options?: string[];
  explanation?: string;
}

// --- Mock Data ---
const mockData = {
  vsa: [
    { id: 'vsa1', q: 'What is the powerhouse of the cell?', a: 'Mitochondria.' },
    { id: 'vsa2', q: 'Define photosynthesis.', a: 'The process by which green plants use sunlight to synthesize nutrients from carbon dioxide and water.' },
  ],
  sa: [
    { id: 'sa1', q: 'Explain the difference between plant and animal cells.', a: 'Plant cells have a cell wall and chloroplasts, which animal cells lack. Animal cells have centrioles, which are usually absent in plant cells.' },
    { id: 'sa2', q: 'What is Newton\'s First Law of Motion?', a: 'An object will remain at rest or in uniform motion in a straight line unless acted upon by an external force.' },
  ],
  la: [
    { id: 'la1', q: 'Describe the stages of cellular respiration in detail.', a: 'Cellular respiration occurs in three main stages:\n\n1. Glycolysis: Breaks down glucose into pyruvate in the cytoplasm.\n2. Krebs Cycle: Occurs in the mitochondria, producing ATP, NADH, and FADH2.\n3. Electron Transport Chain: Uses the electron carriers to produce a large amount of ATP.' },
  ],
  mcq: [
    { 
      id: 'mcq1', 
      q: 'Which of the following is a noble gas?', 
      options: ['Oxygen', 'Nitrogen', 'Helium', 'Carbon'],
      a: 'Helium',
      explanation: 'Helium is a noble gas because its outermost electron shell is full, making it highly unreactive.'
    },
    { 
      id: 'mcq2', 
      q: 'What is the speed of light in a vacuum?', 
      options: ['300,000 km/s', '150,000 km/s', '1,000,000 km/s', '30,000 km/s'],
      a: '300,000 km/s',
      explanation: 'The speed of light in a vacuum is exactly 299,792,458 meters per second, which is approximately 300,000 km/s.'
    }
  ]
};

const filters = ['All', 'Easy', 'Medium', 'Hard', 'Science', 'Math'];

export function StudyHub() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [expandedSection, setExpandedSection] = useState<string | null>('mcq');
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [savedQuestions, setSavedQuestions] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  const toggleQuestion = (id: string) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSave = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderQuestionCard = (item: Question, isMCQ: boolean = false) => {
    const isExpanded = expandedQuestions.has(item.id);
    const isSaved = savedQuestions.has(item.id);

    return (
      <motion.div 
        key={item.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#1e293b] border border-slate-700/50 rounded-xl overflow-hidden mb-3 shadow-sm"
      >
        <div 
          className="p-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
          onClick={() => toggleQuestion(item.id)}
        >
          <div className="flex justify-between items-start gap-4">
            <h4 className="text-slate-200 font-medium leading-relaxed">
              {item.q}
            </h4>
            <button 
              onClick={(e) => toggleSave(item.id, e)}
              className={`p-2 rounded-full transition-colors shrink-0 ${isSaved ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}
            >
              <Bookmark className="w-4 h-4" fill={isSaved ? "currentColor" : "none"} />
            </button>
          </div>

          {isMCQ && item.options && (
            <div className="mt-4 space-y-2">
              {item.options.map((opt: string, idx: number) => (
                <div 
                  key={idx} 
                  className={`p-3 rounded-lg border text-sm ${isExpanded && opt === item.a ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-300' : 'bg-slate-800/50 border-slate-700 text-slate-400'}`}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors">
              {isExpanded ? 'Hide Answer' : 'View Answer'}
            </button>
            <button 
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> Explain
            </button>
            <button 
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
            >
              <Play className="w-3.5 h-3.5" /> Practice
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 pt-0 border-t border-slate-700/50 bg-slate-800/30">
                <div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                  <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Answer</h5>
                  <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                    {item.a}
                  </p>
                  
                  {item.explanation && (
                    <div className="mt-3 pt-3 border-t border-slate-700/50">
                      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Explanation</h5>
                      <p className="text-slate-400 text-sm">{item.explanation}</p>
                    </div>
                  )}

                  <div className="mt-4 flex justify-end">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors">
                      <BrainCircuit className="w-3.5 h-3.5" /> Explain in Simple Language
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const sections = [
    { id: 'vsa', title: 'Very Short Answer Questions', icon: AlignLeft, data: mockData.vsa },
    { id: 'sa', title: 'Short Answer Questions', icon: List, data: mockData.sa },
    { id: 'la', title: 'Long Answer Questions', icon: FileText, data: mockData.la },
    { id: 'mcq', title: 'Multiple Choice Questions', icon: CheckSquare, data: mockData.mcq, isMCQ: true },
  ];

  return (
    <div className="min-h-full bg-[#0f172a] text-slate-200 p-4 md:p-6 pb-24 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Header & Search */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Zap className="w-6 h-6 text-indigo-500" /> Pro
            </h1>
            <div className="flex gap-2">
              <button className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 transition-colors">
                <BookOpen className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search questions, topics..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1e293b] border border-slate-700 text-slate-200 rounded-2xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-500 transition-all shadow-sm"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <div className="flex items-center justify-center p-2 bg-slate-800 rounded-lg text-slate-400 shrink-0">
              <Filter className="w-4 h-4" />
            </div>
            {filters.map(filter => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeFilter === filter 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-[#1e293b] text-slate-400 border border-slate-700 hover:bg-slate-800'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Global AI Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button className="flex flex-col items-center justify-center gap-2 p-4 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl shadow-lg shadow-indigo-900/20 hover:from-indigo-500 hover:to-indigo-700 transition-all border border-indigo-500/30">
            <RefreshCw className="w-6 h-6 text-indigo-100" />
            <span className="text-sm font-semibold text-white">Generate More</span>
          </button>
          <button className="flex flex-col items-center justify-center gap-2 p-4 bg-[#1e293b] rounded-2xl border border-slate-700 hover:bg-slate-800 transition-all shadow-sm">
            <Play className="w-6 h-6 text-emerald-400" />
            <span className="text-sm font-semibold text-slate-200">Practice Mode</span>
          </button>
        </div>

        {/* Accordion Sections */}
        <div className="space-y-4 pt-2">
          {sections.map((section) => {
            const Icon = section.icon;
            const isExpanded = expandedSection === section.id;

            return (
              <div key={section.id} className="bg-[#111827] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <button 
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between p-4 bg-[#1e293b] hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isExpanded ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-400'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-slate-200">{section.title}</h3>
                      <p className="text-xs text-slate-500">{section.data.length} Questions</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 bg-[#0f172a]">
                        {section.data.map((item) => renderQuestionCard(item, section.isMCQ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
