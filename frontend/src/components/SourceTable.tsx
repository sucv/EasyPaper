import React, { useState, useEffect, useMemo, useRef } from 'react';
import SearchBar from './SearchBar';
import TagFilters from './TagFilters';
import PaperTable from './PaperTable';
import type { Paper, SearchFilters } from '../types';

const API = '/api';

interface Props {
  projectId: string;
  onAddToCart: (papers: Paper[]) => void;
  cartIds: Set<string>;
}

export default function SourceTable({ projectId, onAddToCart, cartIds }: Props) {
  const [results, setResults] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<{ years: Record<number, number>; venues: Record<string, number> }>({ years: {}, venues: {} });
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [accessible, setAccessible] = useState(true);
  const [indexedOnly, setIndexedOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState('vector');

  // Post-search refinement state
  const [refinedYears, setRefinedYears] = useState<Set<number>>(new Set());
  const [refinedVenues, setRefinedVenues] = useState<Set<string>>(new Set());
  const [showVenueDropdown, setShowVenueDropdown] = useState(false);
  const venueDropdownRef = useRef<HTMLDivElement>(null);
  const [tagsLoading, setTagsLoading] = useState(true);

 const [tagsLoaded, setTagsLoaded] = useState(false);

  useEffect(() => {
    if (!tagsLoaded) {
      fetchTags();
    }
  }, [projectId]);

  useEffect(() => {
    fetchTags();
  }, [accessible]);

  // Close venue dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (venueDropdownRef.current && !venueDropdownRef.current.contains(e.target as Node)) {
        setShowVenueDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchTags = async () => {
    setTagsLoading(true);
    try {
      const res = await fetch(`${API}/projects/${projectId}/tags?accessible=${accessible}`);
      const data = await res.json();
      setTags(data);
      setTagsLoaded(true);
    } catch {} finally {
      setTagsLoading(false);
    }
  };

  const handleSearch = async (m: string, query: string) => {
    setMethod(m);
    setLoading(true);
    // Reset refinement on new search
    setRefinedYears(new Set());
    setRefinedVenues(new Set());
    try {
      const filters: SearchFilters = { years: selectedYears, venues: selectedVenues, accessible };
      const res = await fetch(`${API}/projects/${projectId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: m, query, filters }),
      });
      const data = await res.json();
      let papers = data.results || [];
      if (indexedOnly) papers = papers.filter((p: Paper) => p.indexed);
      setResults(papers);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  };

  // Extract unique years and venues from current results
  const resultYears = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const p of results) {
      if (p.year) counts[p.year] = (counts[p.year] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([y, c]) => ({ year: Number(y), count: c }))
      .sort((a, b) => b.year - a.year);
  }, [results]);

  const resultVenues = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of results) {
      if (p.venue) counts[p.venue] = (counts[p.venue] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([v, c]) => ({ venue: v, count: c }))
      .sort((a, b) => b.count - a.count);
  }, [results]);

  // Apply refinement filters
  const displayedResults = useMemo(() => {
    return results.filter((p) => {
      if (refinedYears.size > 0 && (!p.year || !refinedYears.has(p.year))) return false;
      if (refinedVenues.size > 0 && (!p.venue || !refinedVenues.has(p.venue))) return false;
      return true;
    });
  }, [results, refinedYears, refinedVenues]);

  const toggleRefinedYear = (y: number) => {
    setRefinedYears((prev) => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y); else next.add(y);
      return next;
    });
  };

  const toggleRefinedVenue = (v: string) => {
    setRefinedVenues((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  };

  const clearRefinement = () => {
    setRefinedYears(new Set());
    setRefinedVenues(new Set());
  };

  const hasRefinement = refinedYears.size > 0 || refinedVenues.size > 0;

  const handleAddSelected = () => {
    const papersToAdd = displayedResults.filter(
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
        {tagsLoading ? (
          <div className="space-y-2.5 animate-pulse">
            <div className="flex gap-1.5 items-center">
              <div className="w-10 h-4 bg-gray-200 rounded" />
              <div className="w-16 h-6 bg-gray-100 rounded-full" />
              <div className="w-16 h-6 bg-gray-100 rounded-full" />
              <div className="w-16 h-6 bg-gray-100 rounded-full" />
              <div className="w-16 h-6 bg-gray-100 rounded-full" />
              <div className="w-16 h-6 bg-gray-100 rounded-full" />
            </div>
            <div className="flex gap-1.5 items-center">
              <div className="w-12 h-4 bg-gray-200 rounded" />
              <div className="w-20 h-6 bg-gray-100 rounded-full" />
              <div className="w-20 h-6 bg-gray-100 rounded-full" />
              <div className="w-20 h-6 bg-gray-100 rounded-full" />
            </div>
            <div className="flex gap-4 items-center pt-1">
              <div className="w-32 h-4 bg-gray-100 rounded" />
              <div className="w-28 h-4 bg-gray-100 rounded" />
            </div>
          </div>
        ) : (
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
        )}
      </div>
      {results.length > 0 && (
        <div className="px-5 pb-5 space-y-3">
          {/* Refine results bar */}
          <div className="flex items-center gap-3 flex-wrap bg-gray-50/60 rounded-lg px-3 py-2 border border-gray-100">
            <span className="text-xs font-medium text-gray-500 shrink-0">
              {hasRefinement
                ? `${displayedResults.length} of ${results.length} results`
                : `${results.length} results`
              }
            </span>

            {/* Year chips */}
            {resultYears.length > 1 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-0.5">Year</span>
                {resultYears.map(({ year, count }) => {
                  const active = refinedYears.has(year);
                  return (
                    <button
                      key={year}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-100 bg-white'
                      }`}
                      onClick={() => toggleRefinedYear(year)}
                    >
                      {year} <span className={active ? 'text-indigo-200' : 'text-gray-400'}>({count})</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Venue dropdown */}
            {resultVenues.length > 1 && (
              <div className="relative" ref={venueDropdownRef}>
                <button
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors flex items-center gap-1 ${
                    refinedVenues.size > 0
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-100 bg-white'
                  }`}
                  onClick={() => setShowVenueDropdown(!showVenueDropdown)}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider">Venue</span>
                  {refinedVenues.size > 0 && (
                    <span className="bg-white/20 px-1 rounded text-[10px]">{refinedVenues.size}</span>
                  )}
                  <svg className={`w-3 h-3 transition-transform ${showVenueDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showVenueDropdown && (
                  <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] max-w-[320px] max-h-[240px] overflow-y-auto">
                    <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Filter by venue</span>
                      {refinedVenues.size > 0 && (
                        <button
                          className="text-[10px] text-gray-400 hover:text-red-500 font-medium"
                          onClick={() => setRefinedVenues(new Set())}
                        >Clear</button>
                      )}
                    </div>
                    {resultVenues.map(({ venue, count }) => {
                      const checked = refinedVenues.has(venue);
                      return (
                        <label
                          key={venue}
                          className="flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50/50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                            checked={checked}
                            onChange={() => toggleRefinedVenue(venue)}
                          />
                          <span className="flex-1 text-xs text-gray-700 truncate" title={venue}>{venue}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">({count})</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Clear all refinement */}
            {hasRefinement && (
              <button
                className="text-[11px] text-gray-400 hover:text-indigo-600 font-medium ml-auto"
                onClick={clearRefinement}
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Add button */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              {hasRefinement ? `Showing ${displayedResults.length} of ${results.length}` : `${results.length} results found`}
            </span>
            <button
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              onClick={handleAddSelected}
              disabled={selectedIds.size === 0}
            >
              Add Selected <span className="bg-indigo-500 px-1.5 py-0.5 rounded text-xs">{selectedIds.size}</span>
            </button>
          </div>

          <PaperTable
            papers={displayedResults}
            selectedIds={selectedIds}
            onToggleSelect={(id) => {
              const paper = displayedResults.find(p => p.paper_id === id);
              if (paper?.source === 'inaccessible_db') return;
              setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
            }}
            onSelectAll={(ids) => {
              const allowed = ids.filter(id => { const p = displayedResults.find(r => r.paper_id === id); return p?.source !== 'inaccessible_db'; });
              setSelectedIds(new Set(allowed));
            }}
            onDeselectAll={() => setSelectedIds(new Set())}
            disabledIds={new Set([...cartIds, ...displayedResults.filter(p => p.source === 'inaccessible_db').map(p => p.paper_id)])}
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