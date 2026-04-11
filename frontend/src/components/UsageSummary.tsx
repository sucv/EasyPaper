import React, { useEffect, useState } from 'react';
import type { UsageData } from '../types';

const API = '/api';
const OCR_PRICE_PER_PAGE = 0.004;

interface Props {
  projectId: string;
  refreshTrigger?: number;
}

export default function UsageSummary({ projectId, refreshTrigger }: Props) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { fetchUsage(); }, [projectId, refreshTrigger]);

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
          </div>
        </div>
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 flex items-center gap-4 text-sm">
          <span className="font-semibold text-gray-700">Usage</span>
          <span className="text-xs text-gray-400">No usage recorded yet</span>
        </div>
      </div>
    );
  }

  const pages = usage.pages_processed || 0;
  const pdfs = usage.pdfs_processed || 0;
  const ocrCost = pages * OCR_PRICE_PER_PAGE;

  const byModel = usage.by_model || {};
  const modelRows: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    calls: number;
    inputPrice: number;
    outputPrice: number;
    inputCost: number;
    outputCost: number;
    totalCost: number;
    hasPricing: boolean;
  }[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalInputCost = 0;
  let totalOutputCost = 0;
  let hasAnyUnknownPricing = false;

  for (const [modelId, data] of Object.entries(byModel)) {
    const inputPrice = data.input_price_per_1m || 0;
    const outputPrice = data.output_price_per_1m || 0;
    const hasPricing = inputPrice > 0 || outputPrice > 0;
    const inputCost = (data.prompt_tokens / 1_000_000) * inputPrice;
    const outputCost = (data.completion_tokens / 1_000_000) * outputPrice;

    if (!hasPricing) hasAnyUnknownPricing = true;

    totalInputTokens += data.prompt_tokens;
    totalOutputTokens += data.completion_tokens;
    totalInputCost += inputCost;
    totalOutputCost += outputCost;

    modelRows.push({
      model: modelId,
      inputTokens: data.prompt_tokens,
      outputTokens: data.completion_tokens,
      calls: data.calls,
      inputPrice,
      outputPrice,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      hasPricing,
    });
  }

  // Sort by total cost descending, unknowns at bottom
  modelRows.sort((a, b) => {
    if (a.hasPricing && !b.hasPricing) return -1;
    if (!a.hasPricing && b.hasPricing) return 1;
    return b.totalCost - a.totalCost;
  });

  const totalModelCost = totalInputCost + totalOutputCost;
  const totalCost = ocrCost + totalModelCost;

  const fmtCost = (v: number) => {
    if (v === 0) return '$0.00';
    if (v < 0.01) return '<$0.01';
    return `$${v.toFixed(2)}`;
  };
  const fmtCostDetail = (v: number) => {
    if (v === 0) return '$0.000';
    if (v < 0.001) return '<$0.001';
    return `$${v.toFixed(3)}`;
  };
  const fmtTokens = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Summary row (always visible) */}
      <div
        className="px-5 py-3 flex items-center gap-4 text-sm cursor-pointer hover:bg-gray-50/50 transition-colors select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-semibold text-gray-700 shrink-0">Usage</span>
        <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
            {pages} page{pages !== 1 ? 's' : ''} · {fmtCost(ocrCost)} OCR
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />
            {fmtTokens(totalInputTokens)} in · {fmtCost(totalInputCost)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-violet-400" />
            {fmtTokens(totalOutputTokens)} out · {fmtCost(totalOutputCost)}
          </span>
          <span className="flex items-center gap-1.5 font-medium text-gray-700">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
            Est. {fmtCost(totalCost)}
            {hasAnyUnknownPricing && <span className="text-amber-500">*</span>}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 ml-auto shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-4 border-t border-gray-100 pt-3 space-y-4">
          {/* OCR Summary */}
          <div className="flex items-center justify-between text-sm bg-amber-50/50 rounded-lg px-4 py-2.5 border border-amber-100">
            <div className="text-gray-700">
              <span className="font-medium">PDF OCR</span>
              <span className="text-gray-500 ml-2">
                {pdfs} PDF{pdfs !== 1 ? 's' : ''}, {pages} page{pages !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="text-gray-700 font-medium tabular-nums">
              {fmtCost(ocrCost)}
              <span className="text-xs text-gray-400 font-normal ml-1">({pages} × $0.004)</span>
            </div>
          </div>

          {/* Model Usage Table */}
          {modelRows.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">LLM Usage by Model</h4>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-200">
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wider">Model</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wider w-16">Calls</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wider w-28">Input Tokens</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wider w-24">Est. Input</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wider w-28">Output Tokens</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wider w-24">Est. Output</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wider w-24">Est. Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {modelRows.map((row, i) => (
                      <tr key={row.model} className={`hover:bg-gray-50/50 ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                        <td className="px-3 py-2 text-gray-800 font-medium">
                          <span className="block truncate max-w-[200px]" title={row.model}>
                            {row.model.split(':').pop() || row.model}
                          </span>
                          {row.hasPricing && (
                            <span className="text-[10px] text-gray-400">
                              ${row.inputPrice}/Mi · ${row.outputPrice}/Mo
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{row.calls}</td>
                        <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmtTokens(row.inputTokens)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.hasPricing
                            ? <span className="text-gray-800 font-medium">{fmtCostDetail(row.inputCost)}</span>
                            : <span className="text-amber-500" title="Pricing not configured">—</span>
                          }
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{fmtTokens(row.outputTokens)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.hasPricing
                            ? <span className="text-gray-800 font-medium">{fmtCostDetail(row.outputCost)}</span>
                            : <span className="text-amber-500" title="Pricing not configured">—</span>
                          }
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.hasPricing
                            ? <span className="text-gray-800 font-semibold">{fmtCostDetail(row.totalCost)}</span>
                            : <span className="text-amber-500" title="Pricing not configured">—</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasAnyUnknownPricing && (
                <p className="text-[11px] text-amber-600 mt-1.5 pl-1">
                  * Some models have no pricing configured. Set <code className="bg-gray-100 px-1 rounded">input_price_per_1m</code> / <code className="bg-gray-100 px-1 rounded">output_price_per_1m</code> in config.yaml for accurate estimates.
                </p>
              )}
            </div>
          )}

          {/* Total */}
          <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
            <div>
              <span className="font-semibold text-gray-700">Total Estimated Cost</span>
              {hasAnyUnknownPricing && (
                <span className="text-xs text-gray-400 ml-2">(partial — some models unpriced)</span>
              )}
            </div>
            <div className="text-right">
              <span className="font-semibold text-gray-900 tabular-nums text-base">{fmtCost(totalCost)}</span>
              <div className="text-[11px] text-gray-400 tabular-nums">
                {fmtCost(ocrCost)} OCR + {fmtCost(totalInputCost)} input + {fmtCost(totalOutputCost)} output
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}