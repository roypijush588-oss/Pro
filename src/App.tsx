import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Summarizer } from './components/Summarizer';
import { StudyMode } from './components/StudyMode';
import { HomeworkSolver } from './components/HomeworkSolver';
import { NoteMaker } from './components/NoteMaker';
import { QuestionGenerator } from './components/QuestionGenerator';
import { RevisionAssistant } from './components/RevisionAssistant';
import { PracticeGenerator } from './components/PracticeGenerator';
import { PerformanceAnalyzer } from './components/PerformanceAnalyzer';
import { NoteView } from './components/NoteView';
import { NotesList } from './components/NotesList';
import { FlashcardsView } from './components/FlashcardsView';
import { ExamBoosterView } from './components/ExamBoosterView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { OfflineBanner } from './components/OfflineBanner';
import { useStore, Note } from './store/useStore';
import { Menu, BookOpen, PlusCircle, Zap, ListChecks, HelpCircle } from 'lucide-react';

const VALID_TABS = new Set([
  'new',
  'study',
  'notemaker',
  'questions',
  'practice',
  'revision',
  'homework',
  'performance',
  'notes',
  'flashcards',
  'exam',
]);

function getInitialTab(): string {
  if (typeof window === 'undefined') return 'new';
  const param = new URLSearchParams(window.location.search).get('tab');
  return param && VALID_TABS.has(param) ? param : 'new';
}

function App() {
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const addNote = useStore(state => state.addNote);

  useEffect(() => {
    const handlePopState = () => {
      const param = new URLSearchParams(window.location.search).get('tab');
      if (param && VALID_TABS.has(param)) {
        setActiveTab(param);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSummaryComplete = (note: Note) => {
    addNote(note);
    setSelectedNoteId(note.id);
    setActiveTab('note-view');
    setIsSidebarOpen(false);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-white text-gray-900 font-sans overflow-hidden">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={handleTabChange} 
        onSelectNote={(id) => { 
          setSelectedNoteId(id); 
          setActiveTab('note-view'); 
          setIsSidebarOpen(false);
        }} 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50/50 pb-16 md:pb-0">
        <div className="md:hidden flex items-center justify-between px-4 py-3 pt-safe bg-white border-b border-gray-200">
          <div className="flex items-center gap-2 font-bold text-gray-900">
            <BookOpen className="w-5 h-5 text-blue-600" />
            SummAIry
          </div>
          <div className="flex items-center gap-2">
            <PWAInstallButton variant="compact" />
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Open menu">
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
        <OfflineBanner />
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {activeTab === 'new' && <Summarizer onSummaryComplete={handleSummaryComplete} />}
          {activeTab === 'study' && <StudyMode onStartPractice={() => handleTabChange('practice')} />}
          {activeTab === 'notemaker' && <NoteMaker />}
          {activeTab === 'questions' && <QuestionGenerator onStartPractice={() => handleTabChange('practice')} />}
          {activeTab === 'practice' && <PracticeGenerator />}
          {activeTab === 'revision' && <RevisionAssistant />}
          {activeTab === 'homework' && <HomeworkSolver />}
          {activeTab === 'performance' && <PerformanceAnalyzer />}
          {activeTab === 'notes' && (
            <NotesList 
              onSelectNote={(id) => { 
                setSelectedNoteId(id); 
                setActiveTab('note-view'); 
              }} 
            />
          )}
          {activeTab === 'note-view' && selectedNoteId && <NoteView noteId={selectedNoteId} />}
          {activeTab === 'flashcards' && <FlashcardsView />}
          {activeTab === 'exam' && <ExamBoosterView />}
        </div>
        
        {/* Bottom Navigation for Mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center p-2 pb-safe z-40">
          <button onClick={() => handleTabChange('new')} className={`flex flex-col items-center p-2 ${activeTab === 'new' ? 'text-blue-600' : 'text-gray-500'}`}>
            <PlusCircle className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-medium">Summary</span>
          </button>
          <button onClick={() => handleTabChange('questions')} className={`flex flex-col items-center p-2 ${activeTab === 'questions' ? 'text-blue-600' : 'text-gray-500'}`}>
            <HelpCircle className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-medium">Questions</span>
          </button>
          <button onClick={() => handleTabChange('practice')} className={`flex flex-col items-center p-2 ${activeTab === 'practice' ? 'text-blue-600' : 'text-gray-500'}`}>
            <ListChecks className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-medium">Practice</span>
          </button>
          <button onClick={() => handleTabChange('revision')} className={`flex flex-col items-center p-2 ${activeTab === 'revision' ? 'text-blue-600' : 'text-gray-500'}`}>
            <Zap className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-medium">Revision</span>
          </button>
        </nav>
      </main>
      <PWAUpdatePrompt />
    </div>
  );
}

export default App;
