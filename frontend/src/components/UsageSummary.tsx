import React, { useEffect, useState } from 'react';
import type { UsageData } from '../types';

const API = '/api';

interface Props {
  projectId: string;
  refreshTrigger: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function UsageSummary({ projectId, refreshTrigger }: Props) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsage();
  }, [projectId, refreshTrigger]);

  const fetchUsage = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/projects/${projectId}/usage`);
      if (res.ok) setUsage(await res.json());
    } catch {} finally {
      setLoading(false);
    }
  };

  if (loading) {
      return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 animate-pulse flex items-center gap-4">
            <div className="w-12 h-4 bg-gray-200 rounded" />
            <div className="flex items-center gap-3">
              <div className="w-24 h-3 bg-gray-100 rounded" />
              <div className="w-20 h-3 bg-gray-100 rounded" />
              <div className="w-20 h-3 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
      );
    }

  if (!usage) return null;

  const totalTokens = usage.total_prompt_tokens + usage.total_completion_tokens;
  if (totalTokens === 0 && usage.pdfs_indexed === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4 text-sm">
          <span className="font-semibold text-gray-700">Usage</span>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
              {usage.pdfs_indexed} PDF{usage.pdfs_indexed !== 1 ? 's' : ''} indexed
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-400" />
              {formatTokens(usage.total_prompt_tokens)} in
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
              {formatTokens(usage.total_completion_tokens)} out
            </span>
          </div>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-4 border-t border-gray-100 pt-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 uppercase tracking-wider">
                <th className="text-left py-1.5 font-semibold">Operation</th>
                <th className="text-right py-1.5 font-semibold">Calls</th>
                <th className="text-right py-1.5 font-semibold">Prompt Tokens</th>
                <th className="text-right py-1.5 font-semibold">Completion Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(usage.by_operation).map(([op, data]) => (
                <tr key={op} className="text-gray-700">
                  <td className="py-1.5 capitalize">{op.replace(/_/g, ' ')}</td>
                  <td className="py-1.5 text-right tabular-nums">{data.calls}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatTokens(data.prompt_tokens)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatTokens(data.completion_tokens)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-gray-900 font-semibold border-t border-gray-200">
                <td className="py-1.5">Total</td>
                <td className="py-1.5 text-right tabular-nums">
                  {Object.values(usage.by_operation).reduce((s, d) => s + d.calls, 0)}
                </td>
                <td className="py-1.5 text-right tabular-nums">{formatTokens(usage.total_prompt_tokens)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatTokens(usage.total_completion_tokens)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}