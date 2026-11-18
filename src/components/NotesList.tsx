import React, { useState } from 'react';
import { Search, Folder, FileText, Trash2, Clock, MoreVertical } from 'lucide-react';
import { useStore } from '../store/useStore';

interface NotesListProps {
  onSelectNote: (id: string) => void;
}

export function NotesList({ onSelectNote }: NotesListProps) {
  const { notes, deleteNote } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const folders = Array.from(new Set(notes.map(n => n.folder)));

  const filteredNotes = notes.filter(note => {
    const matchesSearch = note.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          note.summary.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFolder = selectedFolder ? note.folder === selectedFolder : true;
    return matchesSearch && matchesFolder;
  });

  return (
    <div className="max-w-5xl mx-auto p-6 pb-24 md:pb-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Notes</h2>
          <p className="text-gray-600">Organize and review your summaries.</p>
        </div>
        
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedFolder(null)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            selectedFolder === null ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          All Notes
        </button>
        {folders.map(folder => (
          <button
            key={folder}
            onClick={() => setSelectedFolder(folder)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
              selectedFolder === folder ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Folder className="w-3 h-3" />
            {folder}
          </button>
        ))}
      </div>

      {filteredNotes.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200 border-dashed">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">No notes found</h3>
          <p className="text-gray-500">Create a new summary to see it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map(note => (
            <div key={note.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow group flex flex-col h-48 relative">
              <div className="flex justify-between items-start mb-2">
                <h3 
                  onClick={() => onSelectNote(note.id)}
                  className="font-semibold text-gray-900 line-clamp-1 cursor-pointer hover:text-blue-600 pr-8"
                >
                  {note.title}
                </h3>
                <div className="flex items-center gap-1 absolute right-4 top-4">
                  <button 
                    onClick={() => deleteNote(note.id)}
                    className="p-1 text-gray-400 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    title="Delete Note"
                    aria-label="Delete Note"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="relative">
                    <button 
                      onClick={() => setActiveMenuId(activeMenuId === note.id ? null : note.id)}
                      className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
                      title="More Options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {activeMenuId === note.id && (
                      <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                        <button 
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          onClick={() => {
                            setActiveMenuId(null);
                            onSelectNote(note.id);
                          }}
                        >
                          Open Note
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-gray-600 line-clamp-3 mb-auto cursor-pointer mt-2" onClick={() => onSelectNote(note.id)}>
                {note.summary.replace(/[*#]/g, '')}
              </p>
              
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Folder className="w-3 h-3" /> {note.folder}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {new Date(note.date).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
