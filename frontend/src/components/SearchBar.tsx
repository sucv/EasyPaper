import React, { useState } from 'react';

interface Props {
  onSearch: (method: string, query: string) => void;
  loading: boolean;
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

  const handleSearch = () => {
    if (query.trim()) onSearch(method, query);
  };

  const info = examples[method];

  return (
    <div className="space-y-2">
      <div className="flex">
        <input
          className="flex-1 border border-gray-300 border-r-0 rounded-l-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:z-10 placeholder-gray-400"
          placeholder={info.placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
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