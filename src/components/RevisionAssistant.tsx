import React, { useState, useRef } from 'react';
import { Type, Image as ImageIcon, Loader2, Zap, Download, WifiOff } from 'lucide-react';
import { generateRevisionContent, formatGeminiErrorMessage } from '../lib/gemini';
import { prepareImageDataUrl } from '../lib/imageUtils';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import html2pdf from 'html2pdf.js';

export function RevisionAssistant() {
  const [inputType, setInputType] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [revisionContent, setRevisionContent] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

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

  const handleGenerateRevision = async () => {
    if (!text && !imageUrl) return;
    if (!isOnline) {
      setErrorMessage("Quick Revision requires an internet connection.");
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);
    setRevisionContent(null);
    try {
      const result = await generateRevisionContent(text, imageUrl);
      setRevisionContent(result || "Could not generate revision content.");
    } catch (error: unknown) {
      console.error("Revision generation failed:", error);
      setErrorMessage(formatGeminiErrorMessage(error, "Failed to generate revision content. Please try again."));
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadPDF = () => {
    if (!contentRef.current) return;
    const element = contentRef.current;
    const opt = {
      margin: 1,
      filename: 'quick_revision.pdf',
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in' as const, format: 'letter', orientation: 'portrait' as const }
    };
    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-8 pb-24 md:pb-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Quick Revision</h2>
        <p className="text-gray-500">Generate key points, important facts, and flashcards from any topic.</p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-md">
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
        </div>

        <div className="p-6">
          {inputType === 'text' && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter a topic or paste content here..."
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
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {!isOnline ? (
            <span className="text-xs text-amber-700 flex items-center gap-1.5">
              <WifiOff className="w-3.5 h-3.5 shrink-0" /> Internet connection required to generate revision notes.
            </span>
          ) : (
            <span />
          )}
          <button
            onClick={handleGenerateRevision}
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
                <Zap className="w-4 h-4" /> Generate Revision
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

      {revisionContent && (
        <div className="bg-white rounded-3xl border border-gray-100 p-6 md:p-8 shadow-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
            <h3 className="text-xl font-bold text-gray-900">Revision Content</h3>
            <button 
              onClick={downloadPDF}
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
              title="Download PDF"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
          <div className="prose prose-blue max-w-none" ref={contentRef}>
            <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
              {revisionContent}
            </Markdown>
          </div>
        </div>
      )}
    </div>
  );
}
