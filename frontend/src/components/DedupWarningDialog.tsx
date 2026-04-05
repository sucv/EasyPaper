import React, { useState } from 'react';

export interface DedupItem {
  title: string;
  matchedTitle: string;
  similarity: number;
}

interface Props {
  open: boolean;
  items: DedupItem[];
  contextLabel?: string; // e.g., "cart" or "idea pool"
  onConfirm: (skippedTitles: Set<string>) => void;
  onCancel: () => void;
}

export default function DedupWarningDialog({ open, items, contextLabel = 'collection', onConfirm, onCancel }: Props) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set(items.map((d) => d.title)));

  if (!open || items.length === 0) return null;

  const toggleSkip = (title: string) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const skipAll = () => setSkipped(new Set(items.map((d) => d.title)));
  const keepAll = () => setSkipped(new Set());

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-[640px] max-h-[80vh] shadow-xl space-y-4 flex flex-col">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">Possible Duplicates Found</h3>
        </div>
        <p className="text-sm text-gray-500">
          {items.length} paper{items.length > 1 ? 's' : ''} appear to already exist in the {contextLabel}.
          Checked items will be <strong>skipped</strong>. Uncheck to add anyway.
        </p>

        <div className="overflow-y-auto flex-1 border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 w-8">Skip</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">New Paper</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Matches</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-16">Sim.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.title} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      checked={skipped.has(item.title)}
                      onChange={() => toggleSkip(item.title)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="block truncate max-w-[200px] text-gray-800 font-medium" title={item.title}>
                      {item.title}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="block truncate max-w-[200px] text-gray-500" title={item.matchedTitle}>
                      {item.matchedTitle}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-gray-600 tabular-nums">
                    {item.similarity.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <button className="text-xs text-gray-500 hover:text-gray-700 font-medium" onClick={skipAll}>
              Skip All
            </button>
            <button className="text-xs text-gray-500 hover:text-gray-700 font-medium" onClick={keepAll}>
              Add All Anyway
            </button>
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md font-medium"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-md text-sm font-medium"
              onClick={() => onConfirm(skipped)}
            >
              Confirm ({items.length - skipped.size} to add, {skipped.size} skipped)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}