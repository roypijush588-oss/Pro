import React, { useState, useRef } from 'react';
import { Type, Image as ImageIcon, Link as LinkIcon, Loader2, Settings2 } from 'lucide-react';
import { generateSummary, formatGeminiErrorMessage, SummaryOptions } from '../lib/gemini';
import { prepareImageDataUrl } from '../lib/imageUtils';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { Note } from '../store/useStore';

interface SummarizerProps {
  onSummaryComplete: (note: Note) => void;
}

export function Summarizer({ onSummaryComplete }: SummarizerProps) {
  const [inputType, setInputType] = useState<'text' | 'image' | 'url'>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [options, setOptions] = useState<SummaryOptions>({
    length: '50%',
    format: 'Paragraph',
    mode: 'Study notes',
    language: 'English'
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMessage(null);
    try {
      const prepared = await prepareImageDataUrl(file);
      setImageUrl(prepared);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to load the selected image.'
      );
    }
  };

  const hasActiveInput =
    inputType === 'text'
      ? Boolean(text.trim())
      : inputType === 'image'
        ? Boolean(imageUrl)
        : Boolean(url.trim());

  const handleSummarize = async () => {
    if (!hasActiveInput) return;
    if (!isOnline) {
      setErrorMessage('Generating a summary requires an internet connection.');
      return;
    }

    const activeText = inputType === 'url' ? '' : text;
    const activeImageUrl = inputType === 'image' ? imageUrl : undefined;
    const activeUrl = inputType === 'url' ? url.trim() : undefined;

    setErrorMessage(null);
    setIsProcessing(true);
    try {
      const summaryText = await generateSummary(
        activeText,
        options,
        activeImageUrl,
        activeUrl
      );

      const newNote: Note = {
        id: Date.now().toString(),
        title:
          (activeText.trim()
            ? activeText.trim().slice(0, 30) + (activeText.trim().length > 30 ? '...' : '')
            : '') ||
          activeUrl ||
          'Image Summary',
        originalText: activeText || activeUrl || 'Image content',
        summary: summaryText,
        date: new Date().toISOString(),
        folder: 'Uncategorized',
      };

      onSummaryComplete(newNote);
    } catch (error: unknown) {
      console.error('Summarization failed:', error);
      setErrorMessage(formatGeminiErrorMessage(error, 'Failed to generate summary. Please try again.'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-8 pb-24 md:pb-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-gray-900 tracking-tight">What would you like to summarize?</h2>
        <p className="text-gray-500">Paste text, upload an image, or provide a link to get started.</p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-md">
        {/* Input Type Selector */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setInputType('text')}
            className={`flex-1 flex justify-center items-center gap-2 py-4 text-sm font-medium transition-colors relative ${inputType === 'text' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700 bg-gray-50/50'}`}
          >
            <Type className="w-4 h-4" /> Text
            {inputType === 'text' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
          </button>
          <button
            onClick={() => setInputType('image')}
            className={`flex-1 flex justify-center items-center gap-2 py-4 text-sm font-medium transition-colors relative border-l border-gray-100 ${inputType === 'image' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700 bg-gray-50/50'}`}
          >
            <ImageIcon className="w-4 h-4" /> Image
            {inputType === 'image' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
          </button>
          <button
            onClick={() => setInputType('url')}
            className={`flex-1 flex justify-center items-center gap-2 py-4 text-sm font-medium transition-colors relative border-l border-gray-100 ${inputType === 'url' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700 bg-gray-50/50'}`}
          >
            <LinkIcon className="w-4 h-4" /> Link
            {inputType === 'url' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
          </button>
        </div>

        {/* Input Area */}
        <div className="p-6">
          {inputType === 'text' && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your text here..."
              className="w-full h-64 resize-none outline-none text-gray-700 text-lg placeholder:text-gray-300"
            />
          )}
          {inputType === 'image' && (
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
          {inputType === 'url' && (
            <div className="h-64 flex items-center justify-center">
              <div className="w-full max-w-lg relative">
                <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-lg"
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <button 
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            {showOptions ? 'Hide Options' : 'Advanced Options'}
          </button>
          
          <button
            onClick={handleSummarize}
            disabled={isProcessing || !hasActiveInput}
            className="w-full sm:w-auto flex justify-center items-center gap-2 px-8 py-3 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Summarizing...
              </>
            ) : (
              'Generate Summary'
            )}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Expandable Options */}
      {showOptions && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Length</label>
              <select 
                value={options.length}
                onChange={(e) => setOptions({...options, length: e.target.value})}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="25%">Short (25%)</option>
                <option value="50%">Medium (50%)</option>
                <option value="75%">Detailed (75%)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Format</label>
              <select 
                value={options.format}
                onChange={(e) => setOptions({...options, format: e.target.value})}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Paragraph">Paragraph</option>
                <option value="Bullet points">Bullet Points</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">AI Mode</label>
              <select 
                value={options.mode}
                onChange={(e) => setOptions({...options, mode: e.target.value})}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Simple explanation">Simple Explanation</option>
                <option value="Study notes">Study Notes</option>
                <option value="Key points only">Key Points Only</option>
                <option value="Exam revision mode">Exam Revision</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Language</label>
              <select 
                value={options.language}
                onChange={(e) => setOptions({...options, language: e.target.value})}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Bengali">Bengali</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
