import React, { useState, useEffect } from 'react';
import MarkdownViewer from './MarkdownViewer';
import ExportButton from './ExportButton';
import StatusBadge from './StatusBadge';
import type { IdeaState, Paper, BusyState, WsEvent, TaskConfig, ModelConfig } from '../types';

const API = '/api';
const OCR_PRICE_PER_PAGE = 0.004;

interface ReportMeta { filename: string; title: string; task_name: string | null; model: string | null; created_at: string; }
interface RetrievalMeta { filename: string; paper_title: string; authors: string[]; year: number | null; venue: string | null; }
interface PreflightPaper { paper_id: string; title: string; source: string; pdf_url: string | null; pdf_exists: boolean; tree_exists: boolean; retrieval_exists: boolean; pages: number | null; word_count: number | null; }

interface Props {
  projectId: string; idea: IdeaState; busy: BusyState;
  onDelete: () => void; onAddToCart: (papers: Paper[]) => void;
  addListener: (fn: (e: WsEvent) => void) => () => void; onRefresh: () => void;
}

function parsePageRange(range: string, totalPages: number): number {
  if (!range.trim()) return totalPages;
  let count = 0;
  const parts = range.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(s => parseInt(s.trim()));
      if (!isNaN(start) && !isNaN(end) && end >= start) count += (end - start + 1);
    } else {
      const n = parseInt(trimmed);
      if (!isNaN(n)) count += 1;
    }
  }
  return count || totalPages;
}

function isValidPageRange(range: string): boolean {
  if (!range.trim()) return true;
  return /^[\d,\- ]+$/.test(range) && /^(\s*\d+(\s*-\s*\d+)?\s*)(,\s*\d+(\s*-\s*\d+)?\s*)*$/.test(range.trim());
}

export default function IdeaPanel({ projectId, idea, busy, onDelete, onAddToCart, addListener, onRefresh }: Props) {
  const [papers, setPapers] = useState<Paper[]>(idea.papers);
  const [poolSelected, setPoolSelected] = useState<Set<string>>(new Set());
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [retrievals, setRetrievals] = useState<RetrievalMeta[]>([]);
  const [viewFile, setViewFile] = useState('');
  const [viewContent, setViewContent] = useState('');
  const [viewLabel, setViewLabel] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const [paperProgress, setPaperProgress] = useState<Record<string, { step: string; status: string }>>({});
  const [showGuide, setShowGuide] = useState(true);
  const [tasks, setTasks] = useState<TaskConfig[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedTask, setSelectedTask] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [configLoading, setConfigLoading] = useState(true);

  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [showRetrieveDialog, setShowRetrieveDialog] = useState(false);
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [preflight, setPreflight] = useState<PreflightPaper[]>([]);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [pageRanges, setPageRanges] = useState<Record<string, string>>({});

  useEffect(() => { setPapers(idea.papers); setPoolSelected(new Set()); }, [idea.papers]);

  useEffect(() => {
    fetchFiles(); fetchConfig();
    const unsub = addListener((e) => {
      if (e.type === 'download_progress') { setPaperProgress(prev => ({ ...prev, [e.paper_id]: { step: 'downloading', status: e.status } })); setProgressMsg(`Downloading · ${e.title} (${e.current}/${e.total})`); }
      if (e.type === 'retrieve_progress') { setPaperProgress(prev => ({ ...prev, [e.paper_id]: { step: 'retrieving', status: e.status } })); setProgressMsg(`Processing · ${e.title} (${e.current}/${e.total})`); }
      if (e.type === 'download_complete' || e.type === 'retrieve_complete' || e.type === 'research_complete') { setProgressMsg(''); setPaperProgress({}); fetchFiles(); onRefresh(); }
      if (e.type === 'research_progress') { setProgressMsg(e.message); }
    });
    return unsub;
  }, [idea.idea_slug]);

  const fetchFiles = async () => { try { const res = await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/files`); const data = await res.json(); setReports(data.reports || []); setRetrievals(data.retrievals || []); } catch {} };
  const fetchConfig = async () => { setConfigLoading(true); try { const [t, m] = await Promise.all([fetch(`${API}/config/tasks`), fetch(`${API}/config/models`)]); const td = await t.json(); const md = await m.json(); setTasks(td.tasks || []); setModels(md.models || []); if (td.tasks?.length && !selectedTask) setSelectedTask(td.tasks[0].task_id); if (md.models?.length && !selectedModel) setSelectedModel(md.models[0].id); } catch {} finally { setConfigLoading(false); } };

  const fetchPreflight = async (): Promise<PreflightPaper[]> => {
    setPreflightLoading(true);
    try { const res = await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/preflight`); const data = await res.json(); const pf = data.papers || []; setPreflight(pf); return pf; }
    catch { return []; } finally { setPreflightLoading(false); }
  };

  const handleView = async (filename: string, label?: string) => { setViewFile(filename); setViewLabel(label || filename); try { const res = await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/view/${filename}`); const data = await res.json(); setViewContent(data.content || ''); } catch { setViewContent('Error loading file'); } };
  const handleViewPaper = async (paperId: string, paperTitle: string) => { setViewFile(`paper:${paperId}`); setViewLabel(paperTitle); try { const res = await fetch(`${API}/projects/${projectId}/papers/${paperId}/view`); const data = await res.json(); const meta = data.metadata || {}; let header = ''; if (meta.title) header += `# ${meta.title}\n\n`; const parts: string[] = []; if (meta.authors?.length) parts.push(`**Authors:** ${meta.authors.join(', ')}`); if (meta.year) parts.push(`**Year:** ${meta.year}`); if (meta.venue) parts.push(`**Venue:** ${meta.venue}`); if (meta.citation_count != null) parts.push(`**Citations:** ${meta.citation_count}`); if (parts.length) header += parts.join(' · ') + '\n\n---\n\n'; let pc = data.content || ''; pc = pc.replace(/!\[([^\]]*)\]\(figures\//g, `![$1](papers/${paperId}/figures/`); setViewContent(header + pc); } catch { setViewContent('Error loading paper'); } };
  const handleExportPaper = async (paperId: string) => { try { const res = await fetch(`${API}/projects/${projectId}/papers/${paperId}/export`); if (!res.ok) return; const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${paperId}.zip`; a.click(); URL.revokeObjectURL(a.href); } catch {} };
  const handleCloseViewer = () => { setViewFile(''); setViewContent(''); setViewLabel(''); };
  const handleDeleteReport = async (filename: string, title: string) => { if (!confirm(`Delete report "${title}"?\n\nThis action cannot be undone.`)) return; try { await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/reports/${filename}`, { method: 'DELETE' }); if (viewFile === filename) handleCloseViewer(); fetchFiles(); } catch {} };
  const handleRemoveFromPool = async () => { for (const pid of poolSelected) { await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/papers/${pid}`, { method: 'DELETE' }); } setPoolSelected(new Set()); onRefresh(); };
  const handleSendToCart = () => { const sel = papers.filter(p => poolSelected.has(p.paper_id)); if (sel.length > 0) { onAddToCart(sel); setPoolSelected(new Set()); } };

  const isBusy = busy.busy;
  const isMyOp = busy.idea_slug === idea.idea_slug;

  const openDownloadDialog = async () => { await fetchPreflight(); setShowDownloadDialog(true); };
  const confirmDownload = async () => { setShowDownloadDialog(false); await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/download`, { method: 'POST' }); };

  const openRetrieveDialog = async () => { const pf = await fetchPreflight(); setPageRanges({}); setShowRetrieveDialog(true); };
  const canRetrieve = preflight.length > 0 && preflight.every(p => p.pdf_exists);
  const allPageRangesValid = Object.values(pageRanges).every(v => isValidPageRange(v));
  const confirmRetrieve = async () => {
    setShowRetrieveDialog(false);
    await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/retrieve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_ranges: pageRanges }),
    });
  };

  const openRunDialog = async () => { await fetchPreflight(); setShowRunDialog(true); };
  const canRunTask = preflight.length > 0 && preflight.every(p => p.retrieval_exists);
  const confirmRunTask = async () => {
    setShowRunDialog(false);
    if (!selectedTask || !selectedModel) return;
    const mc = models.find(m => m.id === selectedModel);
    await fetch(`${API}/projects/${projectId}/ideas/${idea.idea_slug}/research`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: selectedTask, model: selectedModel, model_kwargs: mc?.model_kwargs || {} }),
    });
  };

  const getPaperDisplayStatus = (p: Paper): string => {
    const live = paperProgress[p.paper_id];
    if (live) { if (live.status === 'failed') return 'failed'; if (live.status === 'complete' || live.status === 'skipped') return live.step === 'retrieving' ? 'retrieved' : 'downloaded'; return live.step || 'running'; }
    return p.status;
  };
  const canShowActions = (p: Paper) => p.status !== 'pending';
  const formatDate = (iso: string) => { try { const d = new Date(iso); return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
  const selectedTaskInfo = tasks.find(t => t.task_id === selectedTask);
  const fmtCost = (v: number) => v < 0.01 && v > 0 ? '<$0.01' : `$${v.toFixed(3)}`;

  // Retrieve dialog price calculation
  const retrieveEstimate = preflight.filter(p => !p.retrieval_exists && p.pdf_exists).reduce((sum, p) => {
    const pid = p.paper_id;
    const totalPages = p.pages || 0;
    const range = pageRanges[pid] || '';
    const effectivePages = parsePageRange(range, totalPages);
    return sum + effectivePages * OCR_PRICE_PER_PAGE;
  }, 0);

  return (
    <div className="space-y-5">
      {showGuide && (
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg px-4 py-3 flex items-start gap-3">
          <svg className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <div className="flex-1 text-xs text-indigo-800 leading-relaxed"><strong>Workflow:</strong> <span className="mx-1">①</span><strong>Download</strong> — acquire PDFs. <span className="mx-1">②</span><strong>Retrieve</strong> — OCR, build tree, extract sections. <span className="mx-1">③</span><strong>Run Task</strong> — generate a report.</div>
          <button className="text-indigo-400 hover:text-indigo-600 text-lg leading-none shrink-0" onClick={() => setShowGuide(false)}>×</button>
        </div>
      )}

      {/* Paper Pool */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Paper Pool</h4>
        {papers.length > 0 ? (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs table-fixed"><thead><tr className="bg-gray-50/80 border-b border-gray-200">
              <th className="px-2 py-2.5 w-8"><input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" checked={poolSelected.size > 0 && poolSelected.size === papers.length} onChange={() => poolSelected.size === papers.length ? setPoolSelected(new Set()) : setPoolSelected(new Set(papers.map(p => p.paper_id)))} /></th>
              <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Title</th>
              <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[100px] whitespace-nowrap">Authors</th>
              <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-14 whitespace-nowrap">Year</th>
              <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16 whitespace-nowrap">Venue</th>
              <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-14 whitespace-nowrap">Cite</th>
              <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24 whitespace-nowrap">Status</th>
              <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[120px] whitespace-nowrap">Actions</th>
            </tr></thead><tbody className="divide-y divide-gray-100">
              {papers.map((p, i) => {
                const showAct = canShowActions(p);
                const vt = viewFile === `paper:${p.paper_id}`;
                return (<tr key={p.paper_id} className={`h-10 transition-colors ${vt ? 'bg-blue-50 border-l-2 border-l-blue-400' : i % 2 === 1 ? 'bg-gray-50/40' : ''} hover:bg-indigo-50/20`}>
                  <td className="px-2 py-1.5"><input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" checked={poolSelected.has(p.paper_id)} onChange={() => setPoolSelected(prev => { const n = new Set(prev); n.has(p.paper_id) ? n.delete(p.paper_id) : n.add(p.paper_id); return n; })} /></td>
                  <td className="px-2 py-1.5" title={p.title}><span className="block truncate text-gray-800 font-medium">{p.title}</span></td>
                  <td className="px-2 py-1.5 text-gray-500 truncate">{p.authors.length > 0 ? `${p.authors[0]}${p.authors.length > 1 ? ` +${p.authors.length - 1}` : ''}` : '—'}</td>
                  <td className="px-2 py-1.5 text-center text-gray-600 tabular-nums">{p.year || '—'}</td>
                  <td className="px-2 py-1.5 text-center">{p.venue ? <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs truncate max-w-[56px] inline-block">{p.venue}</span> : '—'}</td>
                  <td className="px-2 py-1.5 text-center text-gray-600 tabular-nums text-xs">{p.citation_count != null ? p.citation_count.toLocaleString() : '—'}</td>
                  <td className="px-2 py-1.5"><StatusBadge status={getPaperDisplayStatus(p)} /></td>
                  <td className="px-2 py-1.5">{showAct ? (<div className="flex items-center justify-center gap-1">
                    <a href={`/files/${projectId}/papers/${p.paper_id}/paper.pdf`} target="_blank" rel="noopener noreferrer" className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1.5 py-0.5 text-xs font-medium">PDF</a>
                    {vt ? <button className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded px-1.5 py-0.5 text-xs font-medium" onClick={handleCloseViewer}>✕</button> : <button className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded px-1.5 py-0.5 text-xs font-medium" onClick={() => handleViewPaper(p.paper_id, p.title)}>👁</button>}
                    <button className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded px-1.5 py-0.5 text-xs font-medium" onClick={() => handleExportPaper(p.paper_id)}>📥</button>
                  </div>) : <span className="text-gray-300 text-center block">—</span>}</td>
                </tr>);
              })}
            </tbody></table>
          </div>
        ) : (<div className="border border-dashed border-gray-200 rounded-lg py-6 text-center text-sm text-gray-400">No papers assigned yet.</div>)}
        {poolSelected.size > 0 && (<div className="mt-2 flex gap-2">
          <button className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-md text-xs font-medium" onClick={handleRemoveFromPool}>Remove Selected ({poolSelected.size})</button>
          <button className="border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-md text-xs font-medium" onClick={handleSendToCart}>→ Send to Cart ({poolSelected.size})</button>
        </div>)}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button className="bg-amber-500 hover:bg-amber-400 text-white h-9 px-4 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm" onClick={openDownloadDialog} disabled={isBusy || papers.length === 0}>
          {isBusy && isMyOp && busy.operation === 'download' ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : null}
          ↓ Download
        </button>
        <button className="bg-indigo-600 hover:bg-indigo-500 text-white h-9 px-4 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm" onClick={openRetrieveDialog} disabled={isBusy || papers.length === 0}>
          {isBusy && isMyOp && busy.operation === 'retrieve' ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : null}
          ⟲ Retrieve
        </button>
        <div className="h-6 w-px bg-gray-200 mx-1" />
        {configLoading ? (<div className="flex items-center gap-2 animate-pulse"><div className="w-36 h-9 bg-gray-200 rounded-md" /><div className="w-36 h-9 bg-gray-200 rounded-md" /><div className="w-20 h-9 bg-gray-200 rounded-md" /></div>) : (<>
          <select className="border border-gray-300 rounded-md h-9 px-2 text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-400 max-w-[160px]" value={selectedTask} onChange={e => setSelectedTask(e.target.value)} title={selectedTaskInfo?.description || ''}>
            {tasks.length === 0 && <option value="">No tasks</option>}
            {tasks.map(t => <option key={t.task_id} value={t.task_id}>{t.display_name}</option>)}
          </select>
          <select className="border border-gray-300 rounded-md h-9 px-2 text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-400 max-w-[160px]" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
            {models.length === 0 && <option value="">No models</option>}
            {models.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
          <button className="bg-violet-600 hover:bg-violet-500 text-white h-9 px-4 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm" onClick={openRunDialog} disabled={isBusy || !selectedTask || !selectedModel || papers.length === 0}>
            {isBusy && isMyOp && busy.operation === 'research' ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : null}
            ▶ Run Task
          </button>
        </>)}
        <button className="ml-auto h-9 px-3 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md font-medium transition-colors" onClick={() => { if (confirm('Delete this idea and all its contents?')) onDelete(); }}>🗑 Delete</button>
      </div>

      {progressMsg && isMyOp && (<div className="flex items-center gap-2 text-sm text-indigo-700 bg-indigo-50 px-4 py-2.5 rounded-lg border border-indigo-100"><svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg><span className="truncate">{progressMsg}</span></div>)}

      {/* Reports */}
      {reports.length > 0 && (<div className="space-y-2 pt-2">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">📊 Reports <span className="text-gray-400 font-normal">({reports.length})</span></h4>
        <div className="rounded-lg border border-gray-200 overflow-hidden"><table className="w-full text-xs table-fixed"><thead><tr className="bg-gray-50/80 border-b border-gray-200">
          <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Title</th>
          <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[140px] whitespace-nowrap">Task</th>
          <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[140px] whitespace-nowrap">Model</th>
          <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[140px] whitespace-nowrap">Created</th>
          <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[120px] whitespace-nowrap">Actions</th>
        </tr></thead><tbody className="divide-y divide-gray-100">
          {reports.map((r, i) => { const iv = viewFile === r.filename; return (<tr key={r.filename} className={`h-10 transition-colors ${iv ? 'bg-violet-50 border-l-2 border-l-violet-400' : i % 2 === 1 ? 'bg-gray-50/40' : ''} hover:bg-violet-50/40`}>
            <td className="px-2 py-1.5"><span className="block truncate text-gray-800 font-medium" title={r.title}>{r.title}</span></td>
            <td className="px-2 py-1.5"><span className="block truncate text-gray-500">{r.task_name || <span className="text-gray-300 italic">N/A</span>}</span></td>
            <td className="px-2 py-1.5"><span className="block truncate text-gray-500 text-[11px]">{r.model || <span className="text-gray-300 italic">N/A</span>}</span></td>
            <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{formatDate(r.created_at)}</td>
            <td className="px-2 py-1.5"><div className="flex items-center justify-center gap-1">
              {iv ? <button className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded px-2 py-0.5 text-xs font-medium" onClick={handleCloseViewer}>✕</button> : <button className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded px-2 py-0.5 text-xs font-medium" onClick={() => handleView(r.filename, r.title)}>👁</button>}
              <ExportButton projectId={projectId} ideaSlug={idea.idea_slug} filename={r.filename} />
              <button className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded px-2 py-0.5 text-xs font-medium" onClick={() => handleDeleteReport(r.filename, r.title)}>🗑</button>
            </div></td>
          </tr>); })}
        </tbody></table></div>
      </div>)}

      {/* Retrievals */}
      {retrievals.length > 0 && (<div className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">📄 Retrieved Papers <span className="text-gray-400 font-normal">({retrievals.length})</span></h4>
        <div className="rounded-lg border border-gray-200 overflow-hidden"><table className="w-full text-xs table-fixed"><thead><tr className="bg-gray-50/80 border-b border-gray-200">
          <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Paper Title</th>
          <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[120px] whitespace-nowrap">Authors</th>
          <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-14 whitespace-nowrap">Year</th>
          <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16 whitespace-nowrap">Venue</th>
          <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[100px] whitespace-nowrap">Actions</th>
        </tr></thead><tbody className="divide-y divide-gray-100">
          {retrievals.map((r, i) => { const iv = viewFile === r.filename; return (<tr key={r.filename} className={`h-10 transition-colors ${iv ? 'bg-indigo-50 border-l-2 border-l-indigo-400' : i % 2 === 1 ? 'bg-gray-50/40' : ''} hover:bg-indigo-50/40`}>
            <td className="px-2 py-1.5"><span className="block truncate text-gray-800 font-medium" title={r.paper_title}>{r.paper_title}</span></td>
            <td className="px-2 py-1.5 text-gray-500 truncate">{r.authors.length > 0 ? `${r.authors[0]}${r.authors.length > 1 ? ` +${r.authors.length - 1}` : ''}` : '—'}</td>
            <td className="px-2 py-1.5 text-center text-gray-600 tabular-nums">{r.year || '—'}</td>
            <td className="px-2 py-1.5 text-center">{r.venue ? <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs truncate max-w-[56px] inline-block">{r.venue}</span> : '—'}</td>
            <td className="px-2 py-1.5"><div className="flex items-center justify-center gap-1">
              {iv ? <button className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded px-2 py-0.5 text-xs font-medium" onClick={handleCloseViewer}>✕</button> : <button className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded px-2 py-0.5 text-xs font-medium" onClick={() => handleView(r.filename, r.paper_title)}>👁</button>}
              <ExportButton projectId={projectId} ideaSlug={idea.idea_slug} filename={r.filename} />
            </div></td>
          </tr>); })}
        </tbody></table></div>
      </div>)}

      {reports.length === 0 && retrievals.length === 0 && papers.length > 0 && (
        <div className="border border-dashed border-gray-200 rounded-lg py-6 text-center text-sm text-gray-400">Click <strong>↓ Download</strong>, then <strong>⟲ Retrieve</strong>, then <strong>▶ Run Task</strong>.</div>
      )}

      {viewContent && (<div className="border border-gray-200 rounded-lg max-h-[600px] overflow-auto bg-white shadow-inner">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between z-10">
          <span className="text-xs text-gray-500 font-medium truncate max-w-[80%]" title={viewLabel}>{viewLabel}</span>
          <button className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded p-1" onClick={handleCloseViewer}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="px-6 py-5"><MarkdownViewer content={viewContent} projectId={projectId} /></div>
      </div>)}

      {/* Download Dialog */}
      {showDownloadDialog && (<div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"><div className="bg-white rounded-xl p-6 w-[620px] max-h-[70vh] shadow-xl space-y-4 flex flex-col">
        <h3 className="text-lg font-semibold text-gray-900">Download Papers</h3>
        {preflightLoading ? <div className="py-8 text-center text-gray-400 animate-pulse">Loading...</div> : (<>
          <div className="overflow-y-auto flex-1 max-h-[300px] border border-gray-200 rounded-lg">
            <table className="w-full text-xs"><thead><tr className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <th className="px-3 py-2 text-left font-semibold text-gray-500">Paper</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 w-20">Source</th>
              <th className="px-3 py-2 font-semibold text-gray-500 w-16">Pages</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 w-28">Status</th>
            </tr></thead><tbody className="divide-y divide-gray-100">
              {preflight.map(p => (<tr key={p.paper_id} className="hover:bg-gray-50/50">
                <td className="px-3 py-2"><span className="block truncate max-w-[280px] text-gray-800" title={p.title}>{p.title}</span></td>
                <td className="px-3 py-2 text-gray-500">{p.source === 'user_provided' ? 'Local' : p.pdf_url ? 'URL' : '—'}</td>
                <td className="px-3 py-2 text-center text-gray-600 tabular-nums">{p.pages || '—'}</td>
                <td className="px-3 py-2">{p.pdf_exists ? <span className="text-emerald-600 font-medium">✓ Ready (skip)</span> : <span className="text-amber-600 font-medium">↓ To download</span>}</td>
              </tr>))}
            </tbody></table>
          </div>
          <p className="text-xs text-gray-500">Papers with <strong>✓ Ready</strong> status will be skipped. {preflight.filter(p => !p.pdf_exists).length} to download, {preflight.filter(p => p.pdf_exists).length} already available.</p>
          <div className="flex gap-2 justify-end pt-2">
            <button className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md font-medium" onClick={() => setShowDownloadDialog(false)}>Cancel</button>
            <button className="bg-amber-500 hover:bg-amber-400 text-white px-5 py-2 rounded-md text-sm font-medium" onClick={confirmDownload}>↓ Download</button>
          </div>
        </>)}
      </div></div>)}

      {/* Retrieve Dialog */}
      {showRetrieveDialog && (<div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"><div className="bg-white rounded-xl p-6 w-[720px] max-h-[75vh] shadow-xl space-y-4 flex flex-col">
        <h3 className="text-lg font-semibold text-gray-900">Retrieve Papers</h3>
        {preflightLoading ? <div className="py-8 text-center text-gray-400 animate-pulse">Loading...</div> : (<>
          {!canRetrieve && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">Some papers have not been downloaded yet. Please download all papers first.</div>}
          <div className="overflow-y-auto flex-1 max-h-[300px] border border-gray-200 rounded-lg">
            <table className="w-full text-xs"><thead><tr className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <th className="px-3 py-2 text-left font-semibold text-gray-500">Paper</th>
              <th className="px-3 py-2 font-semibold text-gray-500 w-12">PDF</th>
              <th className="px-3 py-2 font-semibold text-gray-500 w-16">Pages</th>
              <th className="px-3 py-2 font-semibold text-gray-500 w-[120px]">Page Range</th>
              <th className="px-3 py-2 font-semibold text-gray-500 w-20">Est. Cost</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 w-28">Status</th>
            </tr></thead><tbody className="divide-y divide-gray-100">
              {preflight.map(p => {
                const isLong = (p.pages || 0) > 15;
                const isDone = p.retrieval_exists;
                const noPdf = !p.pdf_exists;
                const range = pageRanges[p.paper_id] || '';
                const valid = isValidPageRange(range);
                const effectivePages = isDone ? 0 : parsePageRange(range, p.pages || 0);
                const cost = effectivePages * OCR_PRICE_PER_PAGE;
                return (<tr key={p.paper_id} className={`hover:bg-gray-50/50 ${isLong && !isDone ? 'bg-amber-50/60 border-l-2 border-l-amber-400' : ''}`}>
                  <td className="px-3 py-2"><span className="block truncate max-w-[240px] text-gray-800" title={p.title}>{p.title}</span></td>
                  <td className="px-3 py-2 text-center">{p.pdf_exists ? <a href={`/files/${projectId}/papers/${p.paper_id}/paper.pdf`} target="_blank" rel="noopener noreferrer" className="text-red-500 hover:text-red-700 font-medium">PDF</a> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-center text-gray-600 tabular-nums">{p.pages || '—'}</td>
                  <td className="px-3 py-2">
                    <input
                      className={`w-full border rounded px-2 py-1 text-xs tabular-nums ${isDone || noPdf ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : valid ? 'border-gray-300 focus:ring-1 focus:ring-indigo-400 focus:border-transparent' : 'border-red-400 bg-red-50'}`}
                      placeholder="All (0-indexed)"
                      value={range}
                      onChange={e => setPageRanges(prev => ({ ...prev, [p.paper_id]: e.target.value }))}
                      disabled={isDone || noPdf}
                      title="0-indexed, e.g., 0-5,10,15-20 (page 0 is the first page)"
                    />
                  </td>
                  <td className="px-3 py-2 text-center text-gray-600 tabular-nums">{isDone ? '—' : fmtCost(cost)}</td>
                  <td className="px-3 py-2">{isDone ? <span className="text-emerald-600 font-medium">✓ Done (skip)</span> : noPdf ? <span className="text-red-500 font-medium">⚠ No PDF</span> : <span className="text-indigo-600 font-medium">⟲ To process</span>}</td>
                </tr>);
              })}
            </tbody></table>
          </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <div>
                <span>Papers with <strong>✓ Done</strong> status will be skipped. {preflight.filter(p => !p.retrieval_exists && p.pdf_exists).length} to process.</span>
                <div className="text-gray-400 mt-0.5">Page ranges are 0-indexed: page 0 is the first page of the PDF.</div>
              </div>
              <span className="font-medium text-gray-700 shrink-0 ml-4">OCR est: {fmtCost(retrieveEstimate)}</span>
            </div>
          <div className="flex gap-2 justify-end pt-2">
            <button className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md font-medium" onClick={() => setShowRetrieveDialog(false)}>Cancel</button>
            <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed" onClick={confirmRetrieve} disabled={!canRetrieve || !allPageRangesValid}>⟲ Retrieve</button>
          </div>
        </>)}
      </div></div>)}

      {/* Run Task Dialog */}
      {showRunDialog && (<div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"><div className="bg-white rounded-xl p-6 w-[620px] max-h-[70vh] shadow-xl space-y-4 flex flex-col">
        <h3 className="text-lg font-semibold text-gray-900">Run Task: {selectedTaskInfo?.display_name}</h3>
        {preflightLoading ? <div className="py-8 text-center text-gray-400 animate-pulse">Loading...</div> : (<>
          {!canRunTask && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">Some papers have not been retrieved yet. Please retrieve all papers first.</div>}
          <div className="overflow-y-auto flex-1 max-h-[300px] border border-gray-200 rounded-lg">
            <table className="w-full text-xs"><thead><tr className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <th className="px-3 py-2 text-left font-semibold text-gray-500">Paper</th>
              <th className="px-3 py-2 font-semibold text-gray-500 w-20">Words</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 w-24">Status</th>
            </tr></thead><tbody className="divide-y divide-gray-100">
              {preflight.map(p => (<tr key={p.paper_id} className="hover:bg-gray-50/50">
                <td className="px-3 py-2"><span className="block truncate max-w-[300px] text-gray-800" title={p.title}>{p.title}</span></td>
                <td className="px-3 py-2 text-center text-gray-600 tabular-nums">{p.word_count ? p.word_count.toLocaleString() : '—'}</td>
                <td className="px-3 py-2">{p.retrieval_exists ? <span className="text-emerald-600 font-medium">✓ Ready</span> : <span className="text-red-500 font-medium">⚠ Not retrieved</span>}</td>
              </tr>))}
            </tbody></table>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Model: <strong className="text-gray-700">{models.find(m => m.id === selectedModel)?.display_name || selectedModel}</strong></span>
            <span>·</span>
            <span>{preflight.filter(p => p.retrieval_exists).length} papers, ~{preflight.reduce((s, p) => s + (p.word_count || 0), 0).toLocaleString()} words</span>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md font-medium" onClick={() => setShowRunDialog(false)}>Cancel</button>
            <button className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed" onClick={confirmRunTask} disabled={!canRunTask}>▶ Run Task</button>
          </div>
        </>)}
      </div></div>)}
    </div>
  );
}