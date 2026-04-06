import React, { useState } from 'react';
import IdeaPanel from './IdeaPanel';
import StatusBadge from './StatusBadge';
import type { IdeaState, BusyState, WsEvent } from '../types';

interface Props {
  projectId: string;
  ideas: IdeaState[];
  busy: BusyState;
  loading?: boolean;
  onDeleteIdea: (slug: string) => void;
  addListener: (fn: (e: WsEvent) => void) => () => void;
  onRefresh: () => void;
}

export default function IdeaAccordion({ projectId, ideas, busy, loading = false, onDeleteIdea, addListener, onRefresh }: Props) {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  const getCounts = (idea: IdeaState) => {
    const pending = idea.papers.filter((p) => p.status === 'pending').length;
    const indexed = idea.papers.filter((p) => p.status === 'indexed').length;
    const retrieved = idea.papers.filter((p) => p.status === 'retrieved').length;
    return { pending, indexed, retrieved };
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <h2 className="text-base font-semibold text-gray-900">Research Ideas <span className="text-gray-400 font-normal">({ideas.length})</span></h2>
        {loading && ideas.length === 0 && (
          <div className="py-6 space-y-3 animate-pulse">
            <div className="flex items-center gap-3 px-2">
              <div className="w-4 h-4 bg-gray-200 rounded" />
              <div className="w-64 h-4 bg-gray-200 rounded" />
              <div className="ml-auto flex gap-2">
                <div className="w-16 h-5 bg-gray-100 rounded-full" />
                <div className="w-16 h-5 bg-gray-100 rounded-full" />
              </div>
            </div>
            <div className="flex items-center gap-3 px-2">
              <div className="w-4 h-4 bg-gray-200 rounded" />
              <div className="w-48 h-4 bg-gray-200 rounded" />
              <div className="ml-auto flex gap-2">
                <div className="w-16 h-5 bg-gray-100 rounded-full" />
              </div>
            </div>
          </div>
        )}
        {!loading && ideas.length === 0 && (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            <p className="text-sm text-gray-400 font-medium">No ideas yet</p>
            <p className="text-xs text-gray-400 mt-1">Select papers in the cart and choose "New idea..." from the Assign dropdown.</p>
          </div>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {ideas.map((idea) => {
          const isExpanded = expandedSlug === idea.idea_slug;
          const counts = getCounts(idea);
          const isActive = busy.busy && busy.idea_slug === idea.idea_slug;

          return (
            <div key={idea.idea_slug} className={isActive ? 'border-l-3 border-l-indigo-500' : ''}>
              <button
                className={`w-full text-left px-5 py-3.5 flex justify-between items-center hover:bg-gray-50/80 transition-colors ${isExpanded ? 'bg-gray-50/60' : ''}`}
                onClick={() => setExpandedSlug(isExpanded ? null : idea.idea_slug)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <span className="text-sm font-medium text-gray-800 truncate">{idea.idea_text}</span>
                  {isActive && <StatusBadge status="running" label={busy.operation || 'Running'} />}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {counts.pending > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{counts.pending} pending</span>}
                  {counts.indexed > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{counts.indexed} indexed</span>}
                  {counts.retrieved > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">{counts.retrieved} retrieved</span>}
                  {idea.reports.length > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700">{idea.reports.length} report{idea.reports.length > 1 ? 's' : ''}</span>}
                </div>
              </button>
              {isExpanded && (
                <div className="px-5 pb-5 pt-2 bg-gray-50/30">
                  <IdeaPanel
                    projectId={projectId} idea={idea} busy={busy}
                    onDelete={() => onDeleteIdea(idea.idea_slug)}
                    addListener={addListener} onRefresh={onRefresh}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}