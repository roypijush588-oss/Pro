import React, { useState } from 'react';
import { FileText, BookOpen, BrainCircuit, GraduationCap, Settings, Folder, Plus, X, Zap, ListChecks, TrendingUp, HelpCircle, Lightbulb, Wifi, WifiOff, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';
import { PWAInstallButton } from './PWAInstallButton';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onSelectNote: (noteId: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function Sidebar({ activeTab, setActiveTab, onSelectNote, isOpen, setIsOpen }: SidebarProps) {
  const { notes, flashcardSets, quizSets, pendingSummaries } = useStore();
  const isOnline = useOnlineStatus();
  const [showSettings, setShowSettings] = useState(false);
  const [clearedNotice, setClearedNotice] = useState(false);

  const navItems = [
    { id: 'new', label: 'New Summary', icon: Plus },
    { id: 'study', label: 'Study Mode', icon: Lightbulb },
    { id: 'notemaker', label: 'Create Notes', icon: FileText },
    { id: 'questions', label: 'Question Bank', icon: HelpCircle },
    { id: 'practice', label: 'Practice Generator', icon: ListChecks },
    { id: 'revision', label: 'Quick Revision', icon: Zap },
    { id: 'homework', label: 'Homework Solver', icon: BookOpen },
    { id: 'performance', label: 'Performance Analyzer', icon: TrendingUp },
    { id: 'notes', label: 'My Notes', icon: Folder },
    { id: 'flashcards', label: 'Flashcards', icon: BrainCircuit },
    { id: 'exam', label: 'Exam Booster', icon: GraduationCap },
  ];

  return (
    <div className={cn(
      "fixed inset-y-0 left-0 z-50 w-64 bg-gray-50 border-r border-gray-200 flex flex-col transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
      isOpen ? "translate-x-0" : "-translate-x-full"
    )}>
      <div className="p-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-blue-600" />
          SummAIry
        </h1>
        <button className="md:hidden p-2 text-gray-500 hover:bg-gray-200 rounded-lg" onClick={() => setIsOpen(false)} aria-label="Close menu">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto mt-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          // Hide tabs already represented in the mobile bottom bar
          const isMainTab = ['new', 'questions', 'practice', 'revision'].includes(item.id);
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setIsOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                activeTab === item.id
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                isMainTab ? "hidden md:flex" : "flex"
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </button>
          );
        })}

        <div className="mt-8">
          <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Recent Notes
          </h3>
          <div className="space-y-1">
            {notes.slice(0, 5).map((note) => (
              <button
                key={note.id}
                onClick={() => {
                  setActiveTab('notes');
                  onSelectNote(note.id);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 truncate"
              >
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{note.title || 'Untitled Note'}</span>
              </button>
            ))}
            {notes.length === 0 && (
              <p className="px-3 text-sm text-gray-400 italic">No notes yet</p>
            )}
          </div>
        </div>
      </nav>

      <div className="p-4 border-t border-gray-200 space-y-2 pb-safe">
        <PWAInstallButton variant="sidebar" />
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500">
          {isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              <span>Online • AI Ready</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              <span>Offline • {notes.length} note{notes.length === 1 ? '' : 's'} cached</span>
            </>
          )}
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        >
          <Settings className="w-5 h-5" />
          Settings
        </button>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">App Settings &amp; Storage</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"
                aria-label="Close settings"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-gray-50 rounded-xl p-3.5 text-xs text-gray-600 space-y-1.5">
              <div className="flex justify-between">
                <span>Connection Status</span>
                <span className="font-semibold text-gray-900">{isOnline ? 'Online' : 'Offline'}</span>
              </div>
              <div className="flex justify-between">
                <span>Saved Notes</span>
                <span className="font-semibold text-gray-900">{notes.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Flashcard Sets</span>
                <span className="font-semibold text-gray-900">{flashcardSets.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Practice Quizzes</span>
                <span className="font-semibold text-gray-900">{quizSets.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Offline Sync Queue</span>
                <span className="font-semibold text-gray-900">{pendingSummaries.length}</span>
              </div>
            </div>
            <button
              onClick={() => {
                useStore.setState({
                  notes: [],
                  flashcardSets: [],
                  quizSets: [],
                  pendingSummaries: [],
                });
                setClearedNotice(true);
                setTimeout(() => setClearedNotice(false), 3000);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Clear Local Cached Library
            </button>
            {clearedNotice && (
              <p className="text-xs text-emerald-700 text-center">Local library cleared.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
