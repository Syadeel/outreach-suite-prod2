'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to the console
    console.error('App Runtime Crash:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-10 right-20 w-72 h-72 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-20 left-10 w-96 h-96 bg-rose-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="glass-panel max-w-xl w-full p-8 rounded-2xl border border-rose-500/20 bg-rose-950/5 space-y-6 text-center relative z-10">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-500 animate-pulse">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-heading">Application Runtime Error</h2>
          <p className="text-slate-400 text-xs leading-relaxed">
            A client-side execution crash occurred during component rendering. The details are printed below:
          </p>
        </div>

        <div className="bg-slate-950/90 border border-slate-800/80 rounded-xl p-4 text-left font-mono text-xs text-rose-300 max-h-60 overflow-y-auto whitespace-pre-wrap select-all">
          <span className="font-semibold text-rose-400 block mb-1">
            Error: {error.message || 'Unknown runtime exception'}
          </span>
          {error.stack || 'No stack trace available'}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition-all"
          >
            Force Reload
          </button>
        </div>
      </div>
    </div>
  );
}
