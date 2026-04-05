import React from 'react';
import type { BusyState } from '../types';

interface ProgressInfo {
  step?: string;
  title?: string;
  current?: number;
  total?: number;
  message?: string;
}

interface Props {
  busy: BusyState;
  progress: ProgressInfo | null;
}

const opConfig: Record<string, { color: string; barColor: string; label: string }> = {
  index:    { color: 'bg-amber-500',  barColor: 'bg-amber-400',  label: 'Indexing' },
  retrieve: { color: 'bg-indigo-500', barColor: 'bg-indigo-400', label: 'Retrieving' },
  research: { color: 'bg-violet-500', barColor: 'bg-violet-400', label: 'Generating Report' },
};

export default function StatusBar({ busy, progress }: Props) {
  if (!busy.busy) return null;

  const op = opConfig[busy.operation || ''] || opConfig.index;
  const pct = progress?.total ? Math.round(((progress.current || 0) / progress.total) * 100) : null;

  return (
    <div className="bg-white border-b border-gray-200 px-8 py-2">
      <div className="max-w-[1400px] mx-auto flex items-center gap-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white ${op.color}`}>
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {op.label}
        </span>

        <div className="flex-1">
          <div className="flex items-center gap-3">
            {progress?.title && (
              <span className="text-sm text-gray-700 truncate max-w-[300px]">{progress.title}</span>
            )}
            {progress?.step && (
              <span className="text-xs text-gray-500 capitalize">{progress.step.replace('_', ' ')}</span>
            )}
            {progress?.message && (
              <span className="text-sm text-gray-600">{progress.message}</span>
            )}
          </div>
        </div>

        {pct !== null && (
          <div className="flex items-center gap-2 min-w-[160px]">
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${op.barColor}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-gray-500 tabular-nums">{progress?.current}/{progress?.total}</span>
          </div>
        )}
      </div>
    </div>
  );
}