import React, { useState } from 'react';
import { Download, Share, PlusSquare, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'sidebar' | 'compact';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'sidebar' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'sidebar') {
      return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Installed as App</span>
        </div>
      );
    }
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={
          variant === 'compact'
            ? 'flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all'
            : 'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors'
        }
      >
        <Download className="w-4 h-4 flex-shrink-0" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'compact'
              ? 'flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors'
              : 'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors'
          }
        >
          <Download className="w-4 h-4 flex-shrink-0" />
          <span>{variant === 'compact' ? 'Install' : 'Install on iOS'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-gray-900">Install EduScan AI</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                  aria-label="Close installation guide"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Add this app to your Home Screen for standalone full-screen launch and offline access to your saved notes:
              </p>
              <ol className="space-y-3 text-sm text-gray-700">
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    1
                  </span>
                  <span className="flex items-center gap-1.5 flex-wrap">
                    Tap the <Share className="w-4 h-4 text-blue-600 inline" /> <strong>Share</strong> button in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    2
                  </span>
                  <span className="flex items-center gap-1.5 flex-wrap">
                    Scroll down and tap <PlusSquare className="w-4 h-4 text-blue-600 inline" /> <strong>Add to Home Screen</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    3
                  </span>
                  <span>
                    Tap <strong>Add</strong> in the top-right corner.
                  </span>
                </li>
              </ol>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
