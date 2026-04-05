import React, { useState, useEffect } from 'react';
import SearchBar from './SearchBar';
import TagFilters from './TagFilters';
import PaperTable from './PaperTable';
import type { PaperEntry, SearchFilters } from '../types';

const API = '/api';

interface Props {
  projectId: string;
  onAddToCart: (papers: PaperEntry[]) => void;
  cartIds: Set<string>;
}

export default function SourceTable({ projectId, onAddToCart, cartIds }: Props) {
  const [results, setResults] = useState<PaperEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<{ years: Record<number, number>; venues: Record<string, number> }>({ years: {}, venues: {} });
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [accessible, setAccessible] = useState(true);
  const [indexedOnly, setIndexedOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState('vector');

  useEffect(() => { fetchTags(); }, [projectId, accessible]);

  const fetchTags = async () => {
    try {
      const res = await fetch(`${API}/projects/${projectId}/tags?accessible=${accessible}`);
      const data = await res.json();
      setTags(data);
    } catch {}
  };

  const handleSearch = async (m: string, query: string) => {
    setMethod(m);
    setLoading(true);
    try {
      const filters: SearchFilters = { years: selectedYears, venues: selectedVenues, accessible };
      const res = await fetch(`${API}/projects/${projectId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: m, query, filters }),
      });
      const data = await res.json();
      let papers = data.results || [];
      if (indexedOnly) papers = papers.filter((p: PaperEntry) => p.indexed);
      setResults(papers);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  };

  const handleAddSelected = () => {
    const papersToAdd = results.filter(
      (p) => selectedIds.has(p.paper_id) && !cartIds.has(p.paper_id) && p.source !== 'inaccessible_db'
    );
    onAddToCart(papersToAdd);
    setSelectedIds(new Set());
  };

  const isArxiv = method === 'arxiv';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-4 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Paper Search</h2>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Search across your local database or arXiv. Use <strong>Boolean</strong> expressions (e.g., <code className="bg-gray-100 px-1 rounded">attention AND vision</code>),
            <strong> Vector</strong> for natural language similarity, or <strong>arXiv</strong> query syntax.
            Toggle filters below to narrow results before searching.
          </p>
        </div>
        <SearchBar onSearch={handleSearch} loading={loading} />
        <TagFilters
          years={tags.years} venues={tags.venues}
          selectedYears={selectedYears} selectedVenues={selectedVenues}
          accessible={accessible} indexedOnly={indexedOnly}
          onToggleYear={(y) => setSelectedYears((prev) => prev.includes(y) ? prev.filter((v) => v !== y) : [...prev, y])}
          onToggleVenue={(v) => setSelectedVenues((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])}
          onToggleAccessible={() => setAccessible(!accessible)}
          onToggleIndexed={() => setIndexedOnly(!indexedOnly)}
          onResetYears={() => setSelectedYears([])}
          onResetVenues={() => setSelectedVenues([])}
          disabled={isArxiv}
        />
      </div>
      {results.length > 0 && (
        <div className="px-5 pb-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">{results.length} results found</span>
            <button
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              onClick={handleAddSelected}
              disabled={selectedIds.size === 0}
            >
              Add Selected <span className="bg-indigo-500 px-1.5 py-0.5 rounded text-xs">{selectedIds.size}</span>
            </button>
          </div>
          <PaperTable
            papers={results}
            selectedIds={selectedIds}
            onToggleSelect={(id) => {
              const paper = results.find(p => p.paper_id === id);
              if (paper?.source === 'inaccessible_db') return;
              setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
            }}
            onSelectAll={(ids) => {
              const allowed = ids.filter(id => { const p = results.find(r => r.paper_id === id); return p?.source !== 'inaccessible_db'; });
              setSelectedIds(new Set(allowed));
            }}
            onDeselectAll={() => setSelectedIds(new Set())}
            disabledIds={new Set([...cartIds, ...results.filter(p => p.source === 'inaccessible_db').map(p => p.paper_id)])}
            showAddButton={true}
            showCitation={true}
            showIndexedColumn={false}
            highlightIndexed={true}
            onAdd={(p) => { if (p.source === 'inaccessible_db') return; onAddToCart([p]); }}
            onFetchCitation={async (paper) => {
              try {
                const res = await fetch(`${API}/projects/${projectId}/citation`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: paper.title }),
                });
                const data = await res.json();
                if (data.citation_count != null) {
                  setResults((prev) =>
                    prev.map((p) =>
                      p.paper_id === paper.paper_id ? { ...p, citation_count: data.citation_count } : p
                    )
                  );
                }
              } catch {}
            }}
          />
        </div>
      )}
    </div>
  );
}