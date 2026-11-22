import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Columns, MessageSquare, Volume2, VolumeX, Edit3, Save, MoreVertical, X, Download } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { chatWithSummary, formatGeminiErrorMessage } from '../lib/gemini';
import html2pdf from 'html2pdf.js';

interface NoteViewProps {
  noteId: string;
}

export function NoteView({ noteId }: NoteViewProps) {
  const note = useStore(state => state.notes.find(n => n.id === noteId));
  const updateNote = useStore(state => state.updateNote);
  const [isComparing, setIsComparing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isFlatView, setIsFlatView] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{role: 'user'|'ai', content: string}[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // TTS state
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (note) {
      setEditedSummary(note.summary);
    }
  }, [note]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [noteId]);

  if (!note) return <div className="p-8 text-center">Note not found</div>;

  const handleToggleEdit = () => {
    if (isEditing) {
      updateNote(note.id, editedSummary);
    }
    setIsEditing(!isEditing);
  };

  const handleTTS = () => {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(note.summary.replace(/[*#]/g, ''));
      utterance.onend = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    if (!navigator.onLine) {
      setMessages(prev => [...prev, { role: 'user', content: chatInput }, { role: 'ai', content: "You're currently offline. AI chat requires an internet connection, though you can still read and edit this saved note." }]);
      setChatInput('');
      return;
    }

    const userMsg = chatInput;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatInput('');
    setIsChatting(true);

    try {
      const reply = await chatWithSummary(note.summary, userMsg);
      setMessages(prev => [...prev, { role: 'ai', content: reply }]);
    } catch (error: unknown) {
      setMessages(prev => [...prev, { role: 'ai', content: formatGeminiErrorMessage(error, "Sorry, I couldn't process that request.") }]);
    } finally {
      setIsChatting(false);
    }
  };

  const downloadPDF = () => {
    if (!contentRef.current) return;
    const element = contentRef.current;
    const opt = {
      margin: 1,
      filename: `${note.title || 'summary'}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in' as const, format: 'letter', orientation: 'portrait' as const }
    };
    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="max-w-6xl mx-auto p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{note.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-sm text-gray-500">{new Date(note.date).toLocaleDateString()} • {note.folder}</p>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${note.syncSource === 'synced' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600'}`}>
              {note.syncSource === 'synced' ? 'Synced from Queue' : 'Saved Locally'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={downloadPDF}
            className="p-2 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            title="Download PDF"
          >
            <Download className="w-5 h-5" />
          </button>
          <button 
            onClick={handleTTS}
            className={`p-2 rounded-lg transition-colors ${isPlaying ? 'bg-blue-100 text-blue-700' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            title="Read Aloud"
          >
            {isPlaying ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setIsComparing(!isComparing)}
            className={`p-2 rounded-lg transition-colors ${isComparing ? 'bg-blue-100 text-blue-700' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            title="Compare Original"
          >
            <Columns className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`p-2 rounded-lg transition-colors ${isChatOpen ? 'bg-blue-100 text-blue-700' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            title="Chat with Summary"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <button 
            onClick={handleToggleEdit}
            className="p-2 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            title={isEditing ? "Save Summary" : "Edit Summary"}
          >
            {isEditing ? <Save className="w-5 h-5" /> : <Edit3 className="w-5 h-5" />}
          </button>
          <div className="relative">
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              title="More Options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                <button 
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setShowMenu(false);
                    setIsFlatView((prev) => !prev);
                  }}
                >
                  {isFlatView ? 'Disable Note Flat' : 'Enable Note Flat'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        {/* Main Content (Summary & Original) */}
        <div className={`flex-1 flex flex-col lg:flex-row gap-6 overflow-y-auto lg:overflow-hidden ${isChatOpen ? 'hidden lg:flex' : 'flex'}`}>
          {isComparing && (
            <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6 overflow-y-auto shadow-sm">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Original Text</h3>
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {note.originalText}
              </div>
            </div>
          )}
          
          <div className={`flex-1 overflow-y-auto ${isFlatView ? 'bg-transparent p-2' : 'bg-white rounded-xl border border-gray-200 p-6 shadow-sm'}`} ref={contentRef}>
            {!isFlatView && (
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">AI Summary</h3>
            )}
            {isEditing ? (
              <textarea
                value={editedSummary}
                onChange={(e) => setEditedSummary(e.target.value)}
                className="w-full h-full min-h-[300px] p-4 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            ) : (
              <div className="prose prose-blue max-w-none">
                <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{editedSummary}</Markdown>
              </div>
            )}
          </div>
        </div>

        {/* Chat Sidebar */}
        {isChatOpen && (
          <div className="w-full lg:w-96 bg-white rounded-xl border border-gray-200 flex flex-col shadow-sm overflow-hidden flex-shrink-0 h-[500px] lg:h-auto">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  Chat with Summary
                </h3>
                <p className="text-xs text-gray-500 mt-1">Ask questions about the content.</p>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="lg:hidden p-2 text-gray-500 hover:bg-gray-200 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-gray-400 text-sm mt-10">
                  Ask me anything about this summary!
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                    msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                  }`}>
                    <div className="prose prose-sm max-w-none">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  </div>
                </div>
              ))}
              {isChatting && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm px-4 py-2 text-sm flex gap-1 items-center">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleChatSubmit} className="p-3 border-t border-gray-200 bg-white">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask a question..."
                className="w-full bg-gray-100 border-transparent rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
