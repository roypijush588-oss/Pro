import React, { useState, useRef } from 'react';
import { Loader2, TrendingUp, Download, WifiOff } from 'lucide-react';
import { analyzePerformance, formatGeminiErrorMessage } from '../lib/gemini';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import html2pdf from 'html2pdf.js';

export function PerformanceAnalyzer() {
  const [topic, setTopic] = useState('');
  const [correct, setCorrect] = useState('');
  const [wrong, setWrong] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  const contentRef = useRef<HTMLDivElement>(null);

  const handleAnalyze = async () => {
    if (!topic || (!correct && !wrong)) return;
    if (!isOnline) {
      setErrorMessage("Performance Analyzer requires an internet connection.");
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);
    setAnalysis(null);
    try {
      const result = await analyzePerformance(topic, correct, wrong);
      setAnalysis(result || "Could not generate performance analysis.");
    } catch (error: unknown) {
      console.error("Analysis failed:", error);
      setErrorMessage(formatGeminiErrorMessage(error, "Failed to analyze performance. Please try again."));
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadPDF = () => {
    if (!contentRef.current) return;
    const element = contentRef.current;
    const opt = {
      margin: 1,
      filename: 'performance_analysis.pdf',
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in' as const, format: 'letter', orientation: 'portrait' as const }
    };
    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-8 pb-24 md:pb-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Performance Analyzer</h2>
        <p className="text-gray-500">Enter your test results to get a detailed analysis, weak areas, and suggestions for improvement.</p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-md">
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Photosynthesis, Algebra, World War II"
              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-900"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Correct Answers</label>
              <textarea
                value={correct}
                onChange={(e) => setCorrect(e.target.value)}
                placeholder="List the questions or concepts you got right, or just the number (e.g., 8/10)..."
                className="w-full h-40 p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition-all resize-none text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Wrong Answers</label>
              <textarea
                value={wrong}
                onChange={(e) => setWrong(e.target.value)}
                placeholder="List the questions or concepts you got wrong, or just the number (e.g., 2/10)..."
                className="w-full h-40 p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500 transition-all resize-none text-gray-900"
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {!isOnline ? (
            <span className="text-xs text-amber-700 flex items-center gap-1.5">
              <WifiOff className="w-3.5 h-3.5 shrink-0" /> Internet connection required to analyze performance.
            </span>
          ) : (
            <span />
          )}
          <button
            onClick={handleAnalyze}
            disabled={isProcessing || !isOnline || !topic || (!correct && !wrong)}
            className="w-full sm:w-auto flex justify-center items-center gap-2 px-8 py-3 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Analyzing...
              </>
            ) : !isOnline ? (
              <>
                <WifiOff className="w-4 h-4" /> Offline
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4" /> Analyze Performance
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

      {analysis && (
        <div className="bg-white rounded-3xl border border-gray-100 p-6 md:p-8 shadow-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
            <h3 className="text-xl font-bold text-gray-900">Performance Analysis</h3>
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
              {analysis}
            </Markdown>
          </div>
        </div>
      )}
    </div>
  );
}
