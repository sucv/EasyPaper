import React from 'react';

type BadgeVariant = 'pending' | 'downloading' | 'ocr' | 'metadata' | 'tree_building' | 'indexed' | 'retrieving' | 'retrieved' | 'failed' | 'running' | 'complete' | 'skipped';

const config: Record<string, { bg: string; text: string; label: string; spin?: boolean }> = {
  pending:       { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Pending' },
  downloading:   { bg: 'bg-amber-50',   text: 'text-amber-700',  label: 'Downloading', spin: true },
  ocr:           { bg: 'bg-amber-50',   text: 'text-amber-700',  label: 'OCR Processing', spin: true },
  metadata:      { bg: 'bg-amber-50',   text: 'text-amber-700',  label: 'Extracting Metadata', spin: true },
  tree_building: { bg: 'bg-amber-50',   text: 'text-amber-700',  label: 'Building Tree', spin: true },
  indexed:       { bg: 'bg-blue-50',    text: 'text-blue-700',   label: 'Indexed' },
  retrieving:    { bg: 'bg-indigo-50',  text: 'text-indigo-700', label: 'Retrieving', spin: true },
  retrieved:     { bg: 'bg-emerald-50', text: 'text-emerald-700',label: 'Retrieved' },
  failed:        { bg: 'bg-red-50',     text: 'text-red-700',    label: 'Failed' },
  running:       { bg: 'bg-amber-50',   text: 'text-amber-700',  label: 'Running', spin: true },
  complete:      { bg: 'bg-emerald-50', text: 'text-emerald-700',label: 'Complete' },
  skipped:       { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Skipped' },
};

interface Props {
  status: string;
  label?: string;
}

export default function StatusBadge({ status, label }: Props) {
  const c = config[status] || config.pending;
  const displayLabel = label || c.label;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.spin && (
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {!c.spin && status === 'indexed' && <span>✓</span>}
      {!c.spin && status === 'retrieved' && <span>✓</span>}
      {!c.spin && status === 'complete' && <span>✓</span>}
      {!c.spin && status === 'failed' && <span>✕</span>}
      {!c.spin && status === 'pending' && <span className="opacity-50">○</span>}
      {displayLabel}
    </span>
  );
}