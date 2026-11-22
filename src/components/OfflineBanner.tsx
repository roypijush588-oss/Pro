import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useStore } from '../store/useStore';
import { generateSummary, isQuotaExceededError } from '../lib/gemini';

export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();
  const {
    pendingSummaries,
    updateQueuedSummaryStatus,
    removeQueuedSummary,
    addNote,
  } = useStore();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const isSyncingRef = useRef(false);

  const pendingCount = pendingSummaries.filter((q) => q.status === 'pending' || q.status === 'syncing').length;
  const failedCount = pendingSummaries.filter((q) => q.status === 'failed').length;

  useEffect(() => {
    if (!isOnline || isSyncingRef.current) return;
    const toSync = pendingSummaries.filter((q) => q.status === 'pending');
    if (toSync.length === 0) return;

    let cancelled = false;
    isSyncingRef.current = true;

    const runSync = async () => {
      let syncedCount = 0;
      for (const item of toSync) {
        if (cancelled || !navigator.onLine) break;
        updateQueuedSummaryStatus(item.id, 'syncing');
        try {
          const summaryText = await generateSummary(
            item.text,
            item.options,
            undefined,
            item.url || undefined
          );
          const trimmedText = item.text.trim();
          const syncedTitle = trimmedText
            ? (trimmedText.length > 30 ? `${trimmedText.slice(0, 30)}...` : trimmedText)
            : item.url || 'Synced Summary';
          addNote({
            id: Date.now().toString(),
            title: syncedTitle,
            originalText: item.text || item.url,
            summary: summaryText,
            date: new Date().toISOString(),
            folder: 'Synced Offline Queue',
            syncSource: 'synced',
          });
          removeQueuedSummary(item.id);
          syncedCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Sync failed';
          updateQueuedSummaryStatus(item.id, 'failed', msg);
          if (isQuotaExceededError(err)) {
            break;
          }
        }
      }

      if (!cancelled && syncedCount > 0) {
        setSyncMessage(`Synced ${syncedCount} queued ${syncedCount === 1 ? 'summary' : 'summaries'} to My Notes.`);
        setTimeout(() => setSyncMessage(null), 5000);
      }
      isSyncingRef.current = false;
    };

    runSync();
    return () => {
      cancelled = true;
    };
  }, [isOnline, pendingSummaries, updateQueuedSummaryStatus, removeQueuedSummary, addNote]);

  if (isOnline && pendingCount === 0 && failedCount === 0 && !syncMessage) {
    return null;
  }

  if (!isOnline) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-amber-900 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Offline Mode:</strong> Saved notes, flashcards, and quizzes work from local cache. AI generation requires a connection.
          </span>
        </div>
        {pendingCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900 font-medium text-xs">
            {pendingCount} queued for sync
          </span>
        )}
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-blue-900 text-xs sm:text-sm flex items-center gap-2">
        <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
        <span>Syncing {pendingCount} queued summary request{pendingCount > 1 ? 's' : ''}...</span>
      </div>
    );
  }

  if (syncMessage) {
    return (
      <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-emerald-900 text-xs sm:text-sm flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>{syncMessage}</span>
      </div>
    );
  }

  if (failedCount > 0) {
    const firstFailedError = pendingSummaries.find((q) => q.status === 'failed' && q.error)?.error;
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-red-900 text-xs sm:text-sm flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span className="truncate">
            {failedCount} queued summary request{failedCount > 1 ? 's' : ''} could not sync
            {firstFailedError ? `: ${firstFailedError}` : '.'}
          </span>
        </div>
        <button
          onClick={() =>
            pendingSummaries
              .filter((q) => q.status === 'failed')
              .forEach((q) => updateQueuedSummaryStatus(q.id, 'pending'))
          }
          className="px-2.5 py-1 rounded-md bg-red-100 hover:bg-red-200 text-red-800 font-medium text-xs shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  return null;
};
