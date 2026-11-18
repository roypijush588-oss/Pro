import React, { useEffect } from 'react';
import { RefreshCw, CheckCircle2, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export const PWAUpdatePrompt: React.FC = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Check for SW updates periodically while app stays open
      const interval = setInterval(() => {
        registration.update().catch(() => {
          // Ignore update check failures when offline
        });
      }, 60 * 60 * 1000);
      return () => clearInterval(interval);
    },
    onRegisterError(error) {
      console.error('Service worker registration error:', error);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(() => setOfflineReady(false), 4500);
    return () => clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) {
    return null;
  }

  return (
    <div className="fixed bottom-20 md:bottom-5 right-4 left-4 md:left-auto md:max-w-sm z-50">
      {needRefresh ? (
        <div className="bg-gray-900 text-white rounded-2xl p-4 shadow-xl border border-gray-800 flex items-start gap-3">
          <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold">Update Ready</h4>
            <p className="text-xs text-gray-300 mt-0.5">
              A new version of EduScan AI is ready. Reload safely — your saved notes and quizzes stay intact.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => updateServiceWorker(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Reload to Update
              </button>
              <button
                onClick={() => setNeedRefresh(false)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
              >
                Later
              </button>
            </div>
          </div>
          <button
            onClick={() => setNeedRefresh(false)}
            className="text-gray-400 hover:text-white p-1"
            aria-label="Dismiss update notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="bg-emerald-700 text-white rounded-2xl px-4 py-3 shadow-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>App cached and ready for offline use.</span>
          </div>
          <button
            onClick={() => setOfflineReady(false)}
            className="text-emerald-200 hover:text-white p-1"
            aria-label="Dismiss offline ready notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
