import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  canRetry?: boolean;
  isRetrying?: boolean;
  onRetry?: () => void;
  className?: string;
}

export function ErrorBanner({
  message,
  canRetry = false,
  isRetrying = false,
  onRetry,
  className = '',
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={`bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
        <span>{message}</span>
      </div>
      {canRetry && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-white border border-red-200 hover:bg-red-100 text-red-800 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}
