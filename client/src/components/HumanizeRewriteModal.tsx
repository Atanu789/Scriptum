import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Rewrite {
  original: string;
  replacement: string;
}

interface HumanizeRewriteModalProps {
  isOpen: boolean;
  onClose: () => void;
  rewrites: Rewrite[];
  mode?: string;
  totalCount?: number;
}

export const HumanizeRewriteModal: React.FC<HumanizeRewriteModalProps> = ({
  isOpen,
  onClose,
  rewrites,
  mode = 'balanced-neutral',
  totalCount = rewrites.length,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!isOpen || rewrites.length === 0) {
    return null;
  }

  const current = rewrites[currentIndex];
  const hasNext = currentIndex < rewrites.length - 1;
  const hasPrev = currentIndex > 0;

  const handleNext = () => {
    if (hasNext) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (hasPrev) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const highlightDifferences = (text: string, isOriginal: boolean) => {
    // Simple highlight: show text with basic styling
    // In a more advanced version, could use diff-match-patch for precise highlighting
    return text;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-700 dark:to-blue-800 p-6 text-white">
          <div>
            <h2 className="text-xl font-bold">Humanization Edits</h2>
            <p className="text-blue-100 text-sm mt-1 capitalize">Mode: {mode.replace(/-/g, ' ')}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Original Text */}
            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
                Original
              </label>
              <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {current.original}
                </p>
              </div>
            </div>

            {/* Arrow Icon */}
            <div className="flex justify-center">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-full">
                <ChevronRight size={20} className="text-blue-600 dark:text-blue-400 rotate-90" />
              </div>
            </div>

            {/* Replacement Text */}
            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
                Replaced With
              </label>
              <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {current.replacement}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 dark:bg-slate-800 p-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Edit <span className="font-semibold">{currentIndex + 1}</span> of{' '}
              <span className="font-semibold">{totalCount}</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handlePrev}
                disabled={!hasPrev}
                className="px-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <ChevronLeft size={18} />
                Previous
              </button>

              <button
                onClick={handleNext}
                disabled={!hasNext}
                className="px-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                Next
                <ChevronRight size={18} />
              </button>

              <button
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
