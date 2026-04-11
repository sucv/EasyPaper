import React, { useState, useRef } from 'react';
import PaperTable from './PaperTable';
import type { Paper, IdeaState } from '../types';

interface Props {
  projectId: string;
  cart: Paper[];
  ideas: IdeaState[];
  onRemove: (ids: string[]) => void;
  onAssign: (ideaSlug: string, papers: Paper[]) => void;
  onNewIdea: (text: string, papers: Paper[]) => void;
  onUploadPapers: (files: FileList) => void;
}

export default function CartPanel({ projectId, cart, ideas, onRemove, onAssign, onNewIdea, onUploadPapers }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showNewIdea, setShowNewIdea] = useState(false);
  const [newIdeaText, setNewIdeaText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRemove = () => { onRemove(Array.from(selectedIds)); setSelectedIds(new Set()); };

  const handleAssign = (slug: string) => {
    const papers = cart.filter((p) => selectedIds.has(p.paper_id));
    if (papers.length) { onAssign(slug, papers); setSelectedIds(new Set()); }
  };

  const handleNewIdea = () => {
    if (!newIdeaText.trim()) return;
    const papers = cart.filter((p) => selectedIds.has(p.paper_id));
    onNewIdea(newIdeaText.trim(), papers);
    setNewIdeaText(''); setShowNewIdea(false); setSelectedIds(new Set());
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadPapers(e.target.files);
      // Reset input so the same files can be selected again
      e.target.value = '';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Cart <span className="text-gray-400 font-normal">({cart.length})</span></h2>
            <p className="text-xs text-gray-500 mt-1">
              Selected papers ready for assignment. Use <strong>Load PDFs</strong> to import local papers.
              Select papers and assign them to a research idea to begin processing.
            </p>
          </div>
          <div className="shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-md text-sm font-medium flex items-center gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Load PDFs
            </button>
          </div>
        </div>
      </div>

      {cart.length > 0 ? (
        <div className="px-5 pb-5 space-y-3">
          <PaperTable
            papers={cart}
            selectedIds={selectedIds}
            onToggleSelect={(id) => setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
            onSelectAll={(ids) => setSelectedIds(new Set(ids))}
            onDeselectAll={() => setSelectedIds(new Set())}
            showIndexedColumn={false}
            highlightIndexed={false}
          />
          <div className="flex gap-2 flex-wrap items-center pt-1">
            <button
              className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 px-3.5 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleRemove}
              disabled={selectedIds.size === 0}
            >
              Remove Selected
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-gray-500 font-medium">Assign to:</span>
              <select
                className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value=""
                onChange={(e) => { const val = e.target.value; if (val === '__new__') setShowNewIdea(true); else if (val) handleAssign(val); }}
                disabled={selectedIds.size === 0}
              >
                <option value="">Select idea...</option>
                {ideas.map((idea) => (
                  <option key={idea.idea_slug} value={idea.idea_slug}>{idea.idea_text.slice(0, 60)}</option>
                ))}
                <option value="__new__">+ New idea...</option>
              </select>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-5 pb-8 text-center">
          <p className="text-sm text-gray-400 py-4">No papers in cart. Search above and add papers here, or load PDFs.</p>
        </div>
      )}

      {showNewIdea && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[520px] shadow-xl space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Create New Idea</h3>
            <p className="text-sm text-gray-500">Describe the research theme or retrieval focus. This guides how relevant sections are extracted from papers.</p>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
              placeholder="e.g., the sampling method of survey papers on image generation"
              value={newIdeaText}
              autoFocus
              onChange={(e) => setNewIdeaText(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium" onClick={() => setShowNewIdea(false)}>Cancel</button>
              <button
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                onClick={handleNewIdea}
                disabled={!newIdeaText.trim()}
              >
                Create & Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}