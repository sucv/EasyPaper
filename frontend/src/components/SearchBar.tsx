import React, { useState, useRef, useEffect } from 'react';

interface Props {
  onSearch: (method: string, query: string) => void;
  loading: boolean;
}

interface HistoryItem {
  method: string;
  query: string;
  timestamp: number;
}

const examples: Record<string, { placeholder: string; examples: string[] }> = {
  vector: {
    placeholder: 'Describe what you\'re looking for...',
    examples: [
      'self-supervised learning for visual representations',
      'efficient transformers with linear attention',
      'image generation with diffusion models',
    ],
  },
  boolean: {
    placeholder: 'e.g., attention AND (vision OR multimodal) NOT survey',
    examples: [
      'attention AND transformer',
      'GAN AND (image OR video) NOT survey',
      '"self-supervised" AND contrastive',
    ],
  },
  arxiv: {
    placeholder: 'e.g., au:Vaswani AND ti:attention',
    examples: [
      'ti:diffusion AND cat:cs.CV',
      'au:Hinton AND ti:distillation',
      'abs:transformer AND cat:cs.CL',
    ],
  },
};


export default function SearchBar({ onSearch, loading }: Props) {
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<string>('vector');
  const HISTORY_STORAGE_KEY = 'easypaper_search_history';
  const MAX_HISTORY = 15;

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed.slice(0, MAX_HISTORY);
      }
    } catch {}
    return [];
  });
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Close history dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = () => {
    if (!query.trim()) return;
    onSearch(method, query);
    // Add to history (dedup: move existing to top), persist to localStorage
    setHistory((prev) => {
      const filtered = prev.filter((h) => !(h.query === query.trim() && h.method === method));
      const newItem: HistoryItem = { method, query: query.trim(), timestamp: Date.now() };
      const updated = [newItem, ...filtered].slice(0, MAX_HISTORY);
      try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
    setShowHistory(false);
  };

  const handleSelectHistory = (item: HistoryItem) => {
    setQuery(item.query);
    setMethod(item.method);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const formatTime = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const methodLabel: Record<string, string> = { vector: 'vec', boolean: 'bool', arxiv: 'arx' };

  const info = examples[method];

  return (
    <div className="space-y-2">
      <div className="flex relative">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            className="w-full border border-gray-300 border-r-0 rounded-l-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:z-10 placeholder-gray-400"
            placeholder={info.placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            onFocus={() => { if (history.length > 0) setShowHistory(true); }}
          />
          {showHistory && history.length > 0 && (
            <div
              ref={historyRef}
              className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[280px] overflow-y-auto"
            >
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Searches</span>
                <button
                  className="text-xs text-gray-400 hover:text-red-500 font-medium"
                  onClick={() => {
                    setHistory([]);
                    setShowHistory(false);
                    try { localStorage.removeItem(HISTORY_STORAGE_KEY); } catch {}
                  }}
                >Clear</button>
              </div>
              {history.map((item, i) => (
                <button
                  key={i}
                  className="w-full px-3 py-2 text-left hover:bg-indigo-50/50 flex items-center gap-2 text-sm transition-colors"
                  onClick={() => handleSelectHistory(item)}
                >
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    item.method === 'vector' ? 'bg-indigo-100 text-indigo-600' :
                    item.method === 'boolean' ? 'bg-amber-100 text-amber-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>{methodLabel[item.method]}</span>
                  <span className="flex-1 truncate text-gray-700">{item.query}</span>
                  <span className="shrink-0 text-xs text-gray-400">{formatTime(item.timestamp)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <select
          className="border border-gray-300 border-r-0 px-3 py-2.5 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer font-medium"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="vector">Vector</option>
          <option value="boolean">Boolean</option>
          <option value="arxiv">arXiv</option>
        </select>
        <button
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-r-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          )}
          Search
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-gray-400 pl-1">
        <span className="font-medium text-gray-500">Try:</span>
        {info.examples.map((ex, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-gray-300">·</span>}
            <button
              className="text-indigo-500 hover:text-indigo-700 hover:underline cursor-pointer"
              onClick={() => setQuery(ex)}
            >
              {ex}
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}