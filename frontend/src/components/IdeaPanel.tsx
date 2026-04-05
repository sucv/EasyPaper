import React, { useState, useEffect } from 'react';
import MarkdownViewer from './MarkdownViewer';
import ExportButton from './ExportButton';
import StatusBadge from './StatusBadge';
import type { IdeaState, IdeaPaper, BusyState, WsEvent } from '../types';

const API = '/api';

interface ReportMeta {
  filename: string;
  title: string;
  writing_prompt: string | null;
  created_at: string;
}

interface RetrievalMeta {
  filename: string;
  paper_title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
}

interface Props {
  projectId: string;
  idea: IdeaState;
  busy: BusyState;
  onDelete: () => void;
  addListener: (fn: (e: WsEvent) => void) => () => void;
  onRefresh: () => void;
}

export default function IdeaPanel({ projectId, idea, busy, onDelete, addListener, onRefresh }: Props) {
  const [papers, setPapers] = useState<IdeaPaper[]>(idea.papers);
  const [poolSelected, setPoolSelected] = useState<Set<string>>(new Set());
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [retrievals, setRetrievals] = useState<RetrievalMeta[]>([]);
  const [viewFile, setViewFile] = useState('');
  const [viewContent, setViewContent] = useState('');
  const [viewLabel, setViewLabel] = useState('');
  const [writingPrompt, setWritingPrompt] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const [paperProgress, setPaperProgress] = useState<Record<string, { step: string; status: string }>>({});
  const [showGuide, setShowGuide] = useState(true);

  useEffect(() => { setPapers(idea.papers); setPoolSelected(new Set()); }, [idea.papers]);

  useEffect(() => {
    fetchFiles();
    const unsub = addListener((e) => {
      if (e.type === 'index_progress') {
        setPaperProgress((prev) => ({ ...prev, [e.paper_id]: { step: e.step, status: e.status } }));
        setProgressMsg(`${e.step?.replace('_', ' ')} · ${e.title} (${e.current}/${e.total})`);
      }
      if (e.type === 'retrieve_progress') {
        setPaperProgress((prev) => ({ ...prev, [e.paper_id]: { step: 'retrieving', status: e.status } }));
        setProgressMsg(`Retrieving · ${e.title} (${e.current}/${e.total})`);
      }
      if (e.type === 'index_complete' || e.type === 'retrieve_complete' || e.type === 'research_complete') {
        setProgressMsg('');
        setPaperProgress({});
        fetchFiles();
        onRefresh();
      }
      if (e.type === 'research_progress') {
        setProgressMsg(e.message);
      }
    });
    return unsub;
  }, [idea.idea_slug]);

  const fetchFiles = async () => {
    try {
      const res = await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/files`);
      const data = await res.json();
      setReports(data.reports || []);
      setRetrievals(data.retrievals || []);
    } catch {}
  };

  const handleView = async (filename: string, label?: string) => {
    setViewFile(filename);
    setViewLabel(label || filename);
    try {
      const res = await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/view/${filename}`);
      const data = await res.json();
      setViewContent(data.content || '');
    } catch { setViewContent('Error loading file'); }
  };

  const handleViewPaper = async (paperId: string, paperTitle: string) => {
    setViewFile(`paper:${paperId}`);
    setViewLabel(paperTitle);
    try {
      const res = await fetch(`${API}/projects/${projectId}/papers/${paperId}/view`);
      const data = await res.json();
      // Prepend metadata as a header
      const meta = data.metadata || {};
      let header = '';
      if (meta.title) header += `# ${meta.title}\n\n`;
      const parts: string[] = [];
      if (meta.authors?.length) parts.push(`**Authors:** ${meta.authors.join(', ')}`);
      if (meta.year) parts.push(`**Year:** ${meta.year}`);
      if (meta.venue) parts.push(`**Venue:** ${meta.venue}`);
      if (meta.citation_count != null) parts.push(`**Citations:** ${meta.citation_count}`);
      if (parts.length) header += parts.join(' · ') + '\n\n---\n\n';
      // Rewrite figure paths relative to the paper directory
      let paperContent = data.content || '';
      paperContent = paperContent.replace(
        /!\[([^\]]*)\]\(figures\//g,
        `![$1](papers/${paperId}/figures/`
      );
      setViewContent(header + paperContent);
    } catch { setViewContent('Error loading paper markdown'); }
  };

  const handleExportPaper = async (paperId: string) => {
    try {
      const res = await fetch(`${API}/projects/${projectId}/papers/${paperId}/export`);
      if (!res.ok) return;
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${paperId}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {}
  };

  const handleCloseViewer = () => {
    setViewFile('');
    setViewContent('');
    setViewLabel('');
  };

  const handleRemoveFromPool = async () => {
    for (const pid of poolSelected) {
      await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/papers/${pid}`, { method: 'DELETE' });
    }
    setPoolSelected(new Set());
    onRefresh();
  };

  const isBusy = busy.busy;
  const isMyOp = busy.idea_slug === idea.idea_slug;
  const pendingCount = papers.filter((p) => p.status === 'pending').length;
  const indexedCount = papers.filter((p) => p.status === 'indexed').length;

  const handleIndex = async () => {
    const pending = papers.filter((p) => p.status === 'pending');
    if (!pending.length) { setProgressMsg('No pending papers to index.'); setTimeout(() => setProgressMsg(''), 3000); return; }
    const res = await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/index`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ papers: pending.map((p) => ({ paper_id: p.paper_id, title: p.title, authors: p.authors, year: p.year, venue: p.venue, abstract: p.abstract, citation_count: p.citation_count, source: p.source, pdf_url: p.pdf_url, indexed: false })) }),
    });
    if (res.status === 409 && confirm('An operation appears stuck. Reset and try again?')) {
      await fetch(`${API}/projects/${projectId}/busy/reset`, { method: 'POST' });
      setProgressMsg('Busy state reset. Try again.'); setTimeout(() => setProgressMsg(''), 3000);
    }
  };

  const handleRetrieve = async () => {
    const indexed = papers.filter((p) => p.status === 'indexed').map((p) => p.paper_id);
    if (!indexed.length) { setProgressMsg('No indexed papers to retrieve. Run Index first.'); setTimeout(() => setProgressMsg(''), 3000); return; }
    const res = await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/retrieve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paper_ids: indexed }),
    });
    if (res.status === 409 && confirm('An operation appears stuck. Reset and try again?')) {
      await fetch(`${API}/projects/${projectId}/busy/reset`, { method: 'POST' });
      setProgressMsg('Busy state reset. Try again.'); setTimeout(() => setProgressMsg(''), 3000);
    }
  };

  const handleResearch = async () => {
    if (!writingPrompt.trim()) return;
    await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/research`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writing_prompt: writingPrompt }),
    });
  };

  const getPaperDisplayStatus = (p: IdeaPaper): string => {
    const live = paperProgress[p.paper_id];
    if (live) {
      if (live.status === 'failed') return 'failed';
      if (live.status === 'complete' || live.status === 'skipped') return live.step === 'retrieving' ? 'retrieved' : 'indexed';
      return live.step || 'running';
    }
    return p.status;
  };

  const isIndexed = (p: IdeaPaper) => p.status === 'indexed' || p.status === 'retrieved';

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  return (
    <div className="space-y-5">
      {/* Workflow Guide */}
      {showGuide && (
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg px-4 py-3 flex items-start gap-3">
          <svg className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <div className="flex-1 text-xs text-indigo-800 leading-relaxed">
            <strong className="font-semibold">Workflow:</strong>
            <span className="mx-1">①</span><strong>Index</strong> — downloads PDFs and builds searchable tree structures.
            <span className="mx-1">②</span><strong>Retrieve</strong> — extracts sections relevant to your idea.
            <span className="mx-1">③</span><strong>Research</strong> — generates an integrated report from retrieved content.
          </div>
          <button className="text-indigo-400 hover:text-indigo-600 text-lg leading-none shrink-0" onClick={() => setShowGuide(false)}>×</button>
        </div>
      )}

      {/* Paper Pool */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Paper Pool</h4>
        {papers.length > 0 ? (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200">
                  <th className="px-2 py-2.5 w-8">
                    <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      checked={poolSelected.size > 0 && poolSelected.size === papers.length}
                      onChange={() => poolSelected.size === papers.length ? setPoolSelected(new Set()) : setPoolSelected(new Set(papers.map(p => p.paper_id)))}
                    />
                  </th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Title</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[100px] whitespace-nowrap">Authors</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-14 whitespace-nowrap">Year</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16 whitespace-nowrap">Venue</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28 whitespace-nowrap">Status</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[120px] whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {papers.map((p, i) => {
                  const indexed = isIndexed(p);
                  const isViewingThis = viewFile === `paper:${p.paper_id}`;
                  return (
                    <tr key={p.paper_id} className={`h-10 transition-colors ${isViewingThis ? 'bg-blue-50 border-l-2 border-l-blue-400' : i % 2 === 1 ? 'bg-gray-50/40' : ''} hover:bg-indigo-50/20`}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          checked={poolSelected.has(p.paper_id)}
                          onChange={() => setPoolSelected(prev => { const next = new Set(prev); next.has(p.paper_id) ? next.delete(p.paper_id) : next.add(p.paper_id); return next; })}
                        />
                      </td>
                      <td className="px-2 py-1.5" title={p.title}><span className="block truncate text-gray-800 font-medium">{p.title}</span></td>
                      <td className="px-2 py-1.5 text-gray-500 truncate">{p.authors.length > 0 ? `${p.authors[0]}${p.authors.length > 1 ? ` +${p.authors.length - 1}` : ''}` : '—'}</td>
                      <td className="px-2 py-1.5 text-center text-gray-600 tabular-nums">{p.year || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{p.venue ? <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs truncate max-w-[56px] inline-block">{p.venue}</span> : '—'}</td>
                      <td className="px-2 py-1.5"><StatusBadge status={getPaperDisplayStatus(p)} /></td>
                      <td className="px-2 py-1.5">
                        {indexed ? (
                          <div className="flex items-center justify-center gap-1">
                            <a
                              href={`/files/${projectId}/papers/${p.paper_id}/paper.pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1.5 py-0.5 text-xs font-medium"
                              title="Open PDF"
                            >PDF</a>
                            {isViewingThis ? (
                              <button
                                className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded px-1.5 py-0.5 text-xs font-medium"
                                onClick={handleCloseViewer}
                              >✕</button>
                            ) : (
                              <button
                                className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded px-1.5 py-0.5 text-xs font-medium"
                                onClick={() => handleViewPaper(p.paper_id, p.title)}
                              >👁</button>
                            )}
                            <button
                              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded px-1.5 py-0.5 text-xs font-medium"
                              onClick={() => handleExportPaper(p.paper_id)}
                              title="Export markdown + figures as ZIP"
                            >📥</button>
                          </div>
                        ) : (
                          <span className="text-gray-300 text-center block">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border border-dashed border-gray-200 rounded-lg py-6 text-center text-sm text-gray-400">
            No papers assigned yet. Select papers in the cart and use "Assign to" above.
          </div>
        )}
        {poolSelected.size > 0 && (
          <button className="mt-2 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-md text-xs font-medium" onClick={handleRemoveFromPool}>
            Remove Selected ({poolSelected.size})
          </button>
        )}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            className="bg-amber-500 hover:bg-amber-400 text-white h-9 px-4 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
            onClick={handleIndex} disabled={isBusy}
            title="Download PDFs and build tree indexes for pending papers"
          >
            {isBusy && isMyOp && busy.operation === 'index' ? (
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            ) : null}
            Index {pendingCount > 0 && <span className="bg-amber-400/60 px-1.5 rounded text-xs">{pendingCount}</span>}
          </button>
          <button
            className="bg-indigo-600 hover:bg-indigo-500 text-white h-9 px-4 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
            onClick={handleRetrieve} disabled={isBusy}
            title="Extract relevant sections from indexed papers"
          >
            {isBusy && isMyOp && busy.operation === 'retrieve' ? (
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            ) : null}
            Retrieve {indexedCount > 0 && <span className="bg-indigo-500/60 px-1.5 rounded text-xs">{indexedCount}</span>}
          </button>
          <button
            className="ml-auto h-9 px-3 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md font-medium transition-colors"
            onClick={() => { if (confirm('Delete this idea and all its contents?')) onDelete(); }}
            title="Delete this idea"
          >
            🗑 Delete
          </button>
        </div>

        <div className="flex gap-3 items-end">
          <textarea
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder-gray-400"
            placeholder="Describe the report you want (e.g., Compare sampling methods across papers, identify common limitations and propose future directions...)"
            value={writingPrompt}
            onChange={(e) => setWritingPrompt(e.target.value)}
          />
          <button
            className="bg-violet-600 hover:bg-violet-500 text-white h-10 px-5 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm shrink-0"
            onClick={handleResearch} disabled={isBusy || !writingPrompt.trim()}
            title="Generate an integrated research report"
          >
            {isBusy && isMyOp && busy.operation === 'research' ? (
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            ) : null}
            Research
          </button>
        </div>
      </div>

      {/* Progress */}
      {progressMsg && isMyOp && (
        <div className="flex items-center gap-2 text-sm text-indigo-700 bg-indigo-50 px-4 py-2.5 rounded-lg border border-indigo-100">
          <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          <span className="truncate">{progressMsg}</span>
        </div>
      )}

      {/* Reports Table */}
      {reports.length > 0 && (
        <div className="space-y-2 pt-2">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <span>📊</span> Reports
            <span className="text-gray-400 font-normal">({reports.length})</span>
          </h4>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200">
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Title</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[220px] whitespace-nowrap">Prompt</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[140px] whitespace-nowrap">Created</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[100px] whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map((r, i) => {
                  const isViewing = viewFile === r.filename;
                  return (
                    <tr key={r.filename} className={`h-10 transition-colors ${isViewing ? 'bg-violet-50 border-l-2 border-l-violet-400' : i % 2 === 1 ? 'bg-gray-50/40' : ''} hover:bg-violet-50/40`}>
                      <td className="px-2 py-1.5">
                        <span className="block truncate text-gray-800 font-medium" title={r.title}>{r.title}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="block truncate text-gray-500" title={r.writing_prompt || ''}>
                          {r.writing_prompt || <span className="text-gray-300 italic">N/A</span>}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{formatDate(r.created_at)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          {isViewing ? (
                            <button
                              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded px-2 py-0.5 text-xs font-medium"
                              onClick={handleCloseViewer}
                            >✕ Close</button>
                          ) : (
                            <button
                              className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded px-2 py-0.5 text-xs font-medium"
                              onClick={() => handleView(r.filename, r.title)}
                            >👁 View</button>
                          )}
                          <ExportButton projectId={projectId} ideaSlug={idea.idea_slug} filename={r.filename} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Retrievals Table */}
      {retrievals.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <span>📄</span> Retrieved Segments
            <span className="text-gray-400 font-normal">({retrievals.length})</span>
          </h4>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200">
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Paper Title</th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[120px] whitespace-nowrap">Authors</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-14 whitespace-nowrap">Year</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16 whitespace-nowrap">Venue</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[100px] whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {retrievals.map((r, i) => {
                  const isViewing = viewFile === r.filename;
                  return (
                    <tr key={r.filename} className={`h-10 transition-colors ${isViewing ? 'bg-indigo-50 border-l-2 border-l-indigo-400' : i % 2 === 1 ? 'bg-gray-50/40' : ''} hover:bg-indigo-50/40`}>
                      <td className="px-2 py-1.5">
                        <span className="block truncate text-gray-800 font-medium" title={r.paper_title}>{r.paper_title}</span>
                      </td>
                      <td className="px-2 py-1.5 text-gray-500 truncate">
                        {r.authors.length > 0 ? `${r.authors[0]}${r.authors.length > 1 ? ` +${r.authors.length - 1}` : ''}` : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-center text-gray-600 tabular-nums">{r.year || '—'}</td>
                      <td className="px-2 py-1.5 text-center">
                        {r.venue ? <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs truncate max-w-[56px] inline-block">{r.venue}</span> : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          {isViewing ? (
                            <button
                              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded px-2 py-0.5 text-xs font-medium"
                              onClick={handleCloseViewer}
                            >✕ Close</button>
                          ) : (
                            <button
                              className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded px-2 py-0.5 text-xs font-medium"
                              onClick={() => handleView(r.filename, r.paper_title)}
                            >👁 View</button>
                          )}
                          <ExportButton projectId={projectId} ideaSlug={idea.idea_slug} filename={r.filename} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No content message */}
      {reports.length === 0 && retrievals.length === 0 && papers.length > 0 && (
        <div className="border border-dashed border-gray-200 rounded-lg py-6 text-center text-sm text-gray-400">
          Run <strong>Retrieve</strong> to generate paper extractions, then <strong>Research</strong> to create reports.
        </div>
      )}

      {/* Markdown Viewer */}
      {viewContent && (
        <div className="border border-gray-200 rounded-lg max-h-[600px] overflow-auto bg-white shadow-inner">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between z-10">
            <span className="text-xs text-gray-500 font-medium truncate max-w-[80%]" title={viewLabel}>{viewLabel}</span>
            <button
              className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded p-1 transition-colors"
              onClick={handleCloseViewer}
              title="Close viewer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="px-6 py-5">
            <MarkdownViewer content={viewContent} projectId={projectId} />
          </div>
        </div>
      )}
    </div>
  );
}