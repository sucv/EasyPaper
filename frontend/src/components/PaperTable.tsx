import React, { useState, useMemo } from 'react';
import type { Paper } from '../types';
import { truncate } from '../utils/formatting';

interface Props {
  papers: Paper[];
  selectedIds: Set<string>;
  onToggleSelect: (paperId: string) => void;
  onSelectAll: (ids: string[]) => void;
  onDeselectAll: () => void;
  disabledIds?: Set<string>;
  showAddButton?: boolean;
  showCitation?: boolean;
  showIndexedColumn?: boolean;
  highlightIndexed?: boolean;
  onAdd?: (paper: Paper) => void;
  onFetchCitation?: (paper: Paper) => void;
  pageSize?: number;
}

type SortKey = 'title' | 'year' | 'venue' | 'citation_count';

export default function PaperTable({
  papers, selectedIds, onToggleSelect, onSelectAll, onDeselectAll,
  disabledIds = new Set(), showAddButton = false, showCitation = true,
  showIndexedColumn = true, highlightIndexed = false,
  onAdd, onFetchCitation, pageSize = 20,
}: Props) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    const arr = [...papers];
    arr.sort((a, b) => {
      let va: any = a[sortKey] ?? '';
      let vb: any = b[sortKey] ?? '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return arr;
  }, [papers, sortKey, sortAsc]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const visible = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const allVisible = visible.map((p) => p.paper_id);
  const allSelected = visible.length > 0 && allVisible.every((id) => selectedIds.has(id));

  const SortIcon = ({ active, asc }: { active: boolean; asc: boolean }) => (
    <span className={`inline-block ml-0.5 ${active ? 'text-indigo-600' : 'text-gray-300'}`}>
      {active ? (asc ? '↑' : '↓') : '↕'}
    </span>
  );

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200">
              <th className="px-2 py-2.5 w-9">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  checked={allSelected}
                  onChange={() => allSelected ? onDeselectAll() : onSelectAll(allVisible)}
                />
              </th>
              <th
                className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
                onClick={() => toggleSort('title')}
              >
                <span className="inline-flex items-center gap-0.5">Title<SortIcon active={sortKey === 'title'} asc={sortAsc} /></span>
              </th>
              <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[180px] whitespace-nowrap">Abstract</th>
              <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[100px] whitespace-nowrap">Authors</th>
              <th
                className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-14 cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
                onClick={() => toggleSort('year')}
              >
                <span className="inline-flex items-center gap-0.5">Year<SortIcon active={sortKey === 'year'} asc={sortAsc} /></span>
              </th>
              <th
                className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[72px] cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
                onClick={() => toggleSort('venue')}
              >
                <span className="inline-flex items-center gap-0.5">Venue<SortIcon active={sortKey === 'venue'} asc={sortAsc} /></span>
              </th>
              {showCitation && (
                <th
                  className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-14 cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
                  onClick={() => toggleSort('citation_count')}
                >
                  <span className="inline-flex items-center gap-0.5">Cite<SortIcon active={sortKey === 'citation_count'} asc={sortAsc} /></span>
                </th>
              )}
              {showAddButton && <th className="px-2 py-2.5 w-11 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Add</th>}
              {showIndexedColumn && <th className="px-2 py-2.5 w-11 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Idx</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((paper, i) => {
              const disabled = disabledIds.has(paper.paper_id);
              const indexedHighlight = highlightIndexed && paper.indexed;
              return (
                <tr
                  key={paper.paper_id}
                  className={`h-11 transition-colors ${disabled ? 'opacity-50 bg-gray-50/50' : 'hover:bg-indigo-50/30'} ${i % 2 === 1 ? 'bg-gray-50/40' : ''} ${indexedHighlight ? 'border-l-2 border-l-emerald-400 bg-emerald-50/20' : ''}`}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      checked={selectedIds.has(paper.paper_id)}
                      disabled={disabled}
                      onChange={() => onToggleSelect(paper.paper_id)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="block truncate text-gray-800 font-medium" title={paper.title}>
                      {truncate(paper.title, 120)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="block truncate text-gray-500 text-xs" title={paper.abstract || ''}>
                      {paper.abstract ? truncate(paper.abstract, 120) : <span className="text-gray-300 italic">N/A</span>}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="text-gray-600 text-xs truncate block">
                      {paper.authors.length > 0 ? `${paper.authors[0]}${paper.authors.length > 1 ? ` +${paper.authors.length - 1}` : ''}` : <span className="text-gray-300">—</span>}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 tabular-nums">{paper.year || <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5">
                    {paper.venue ? (
                      <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium truncate max-w-[60px]">{paper.venue}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  {showCitation && (
                    <td className="px-2 py-1.5 text-gray-600 tabular-nums text-xs">
                      {paper.citation_count != null ? (
                        paper.citation_count.toLocaleString()
                      ) : onFetchCitation ? (
                        <button
                          className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded p-0.5 transition-colors"
                          onClick={(e) => { e.stopPropagation(); onFetchCitation(paper); }}
                          title="Fetch citation count"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}
                  {showAddButton && (
                    <td className="px-2 py-1.5 text-center">
                      <button
                        className={`w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold transition-colors ${
                          disabled
                            ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700'
                        }`}
                        onClick={() => onAdd?.(paper)}
                        disabled={disabled}
                        title={disabled ? 'Already in cart / inaccessible' : 'Add to cart'}
                      >
                        {disabled ? '✓' : '+'}
                      </button>
                    </td>
                  )}
                  {showIndexedColumn && (
                    <td className="px-2 py-1.5 text-center">
                      {paper.indexed
                        ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-xs">✓</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  )}
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={99} className="px-2 py-8 text-center text-gray-400 text-sm">No papers to display</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {highlightIndexed && papers.some(p => p.indexed) && (
        <p className="text-xs text-gray-400 mt-1.5 pl-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400 mr-1 align-middle" />
          Green-highlighted rows are already indexed
        </p>
      )}
      {totalPages > 1 && (
        <div className="flex gap-1 items-center justify-center mt-3">
          <button className="px-2.5 py-1 text-sm border border-gray-200 rounded-md bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
          <span className="text-sm text-gray-500 px-3 tabular-nums">Page {page + 1} of {totalPages}</span>
          <button className="px-2.5 py-1 text-sm border border-gray-200 rounded-md bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>›</button>
        </div>
      )}
    </div>
  );
}