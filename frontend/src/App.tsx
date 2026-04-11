import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import SourceTable from './components/SourceTable';
import CartPanel from './components/CartPanel';
import IdeaAccordion from './components/IdeaAccordion';
import StatusBar from './components/StatusBar';
import ToastContainer, { type ToastItem } from './components/Toast';
import ChatPanel from './components/ChatPanel';
import UsageSummary from './components/UsageSummary';
import DedupWarningDialog, { type DedupItem } from './components/DedupWarningDialog';
import { useProject } from './hooks/useProject';
import { useWebSocket } from './hooks/useWebSocket';
import type { Paper, IdeaState } from './types';
import { sanitizeTitle } from './utils/formatting';

const API = '/api';

export default function App() {
  const { projectId, setProjectId, projectState, projects, fetchProjects, createProject, loadProject, refreshProject } = useProject();
  const { busyState, addListener } = useWebSocket(projectId);
  const [cart, setCart] = useState<Paper[]>([]);
  const [ideas, setIdeas] = useState<IdeaState[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [globalProgress, setGlobalProgress] = useState<any>(null);
  const [usageRefresh, setUsageRefresh] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [projectLoading, setProjectLoading] = useState(false);

  // Dedup dialog state
  const [dedupDialog, setDedupDialog] = useState<{
    items: DedupItem[];
    contextLabel: string;
    onConfirm: (skippedTitles: Set<string>) => void;
    onCancel: () => void;
  } | null>(null);

  useEffect(() => { fetchProjects(); }, []);

  useEffect(() => {
    if (projectState) setIdeas(projectState.ideas || []);
  }, [projectState]);

  useEffect(() => {
    if (!projectId) return;
    const unsub = addListener((e) => {
      if (e.type === 'index_progress' || e.type === 'retrieve_progress') {
        setGlobalProgress({ step: e.step, title: e.title, current: e.current, total: e.total });
      }
      if (e.type === 'research_progress') {
        setGlobalProgress({ message: e.message });
      }
      if (e.type === 'index_complete') {
        setGlobalProgress(null);
        addToast('Indexing complete', 'success');
        setUsageRefresh((n) => n + 1);
      }
      if (e.type === 'retrieve_complete') {
        setGlobalProgress(null);
        addToast('Retrieval complete', 'success');
        setUsageRefresh((n) => n + 1);
      }
      if (e.type === 'research_complete') {
        setGlobalProgress(null);
        addToast(`Report generated: ${e.report_title}`, 'success');
        setUsageRefresh((n) => n + 1);
      }
      if (e.type === 'chat_response') {
        setUsageRefresh((n) => n + 1);
      }
      if (e.type === 'busy_state' && !e.busy) {
        setGlobalProgress(null);
      }
    });
    return unsub;
  }, [projectId, addListener]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Dedup helpers ──

  const showDedupDialog = useCallback((items: DedupItem[], contextLabel: string): Promise<Set<string>> => {
    return new Promise((resolve) => {
      setDedupDialog({
        items,
        contextLabel,
        onConfirm: (skippedTitles) => { setDedupDialog(null); resolve(skippedTitles); },
        onCancel: () => { setDedupDialog(null); resolve(new Set(items.map(d => d.title))); },
      });
    });
  }, []);

  const batchDedupCheck = useCallback(async (titles: string[], existingTitles: string[]): Promise<DedupItem[]> => {
    if (!projectId || titles.length === 0 || existingTitles.length === 0) return [];
    try {
      const res = await fetch(`${API}/projects/${projectId}/dedup-check-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles, existing_titles: existingTitles }),
      });
      const data = await res.json();
      return (data.results || [])
        .filter((r: any) => r.duplicate)
        .map((r: any) => ({
          title: r.title,
          matchedTitle: r.matched_title,
          similarity: r.similarity,
        }));
    } catch {
      return [];
    }
  }, [projectId]);

  const batchFetchCitations = useCallback(async (papers: Paper[]) => {
    if (!projectId) return;
    const needCitation = papers.filter((p) => p.citation_count == null && p.title);
    if (needCitation.length === 0) return;
    try {
      const res = await fetch(`${API}/projects/${projectId}/citation-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles: needCitation.map((p) => p.title) }),
      });
      const data = await res.json();
      const citationMap = new Map<string, number>();
      for (const r of data.results || []) {
        if (r.citation_count != null) {
          citationMap.set(r.title, r.citation_count);
        }
      }
      if (citationMap.size > 0) {
        setCart((prev) =>
          prev.map((p) => {
            const count = citationMap.get(p.title);
            return count != null ? { ...p, citation_count: count } : p;
          })
        );
      }
    } catch {}
  }, [projectId]);

  // ── Project handlers ──

  const handleSelectProject = async (pid: string) => {
    if (busyState.busy) {
      alert('An operation is in progress. Please wait until it finishes before switching projects.');
      return;
    }
    setProjectId(pid);
    setCart([]);
    setIdeas([]);
    setProjectLoading(true);
    try {
      await loadProject(pid);
    } finally {
      setProjectLoading(false);
    }
  };

  const handleCreateProject = async (name?: string) => {
    if (busyState.busy) {
      alert('An operation is in progress. Please wait until it finishes before creating a project.');
      return;
    }
    setIdeas([]);
    setCart([]);
    const pid = await createProject(name);
    await loadProject(pid);
  };

  const handleDeleteProject = async () => {
    if (!projectId) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/projects/${projectId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to delete project');
      }
      setProjectId(null);
      setCart([]);
      setIdeas([]);
      await fetchProjects();
      addToast('Project deleted', 'info');
    } catch (e: any) {
      addToast(`Failed to delete project: ${e.message}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ── Cart ──

  const cartIds = new Set(cart.map((p) => p.paper_id));

  const addToCart = useCallback(async (papers: Paper[]) => {
    if (!projectId) return;
    let surviving = papers.filter((p) => !cartIds.has(p.paper_id));
    if (surviving.length === 0) return;

    // Stage 1: Internal dedup — user papers vs search papers
    const userPapers = surviving.filter((p) => p.source === 'user_provided');
    const searchPapers = surviving.filter((p) => p.source !== 'user_provided');

    if (userPapers.length > 0 && searchPapers.length > 0) {
      const dups = await batchDedupCheck(
        userPapers.map((p) => p.title),
        searchPapers.map((p) => p.title),
      );
      if (dups.length > 0) {
        const skippedTitles = await showDedupDialog(dups, 'selected search results');
        surviving = surviving.filter((p) => !skippedTitles.has(p.title));
      }
    }

    if (surviving.length === 0) return;

    // Stage 2: Dedup against existing cart
    const existingCartTitles = cart.map((p) => p.title);
    if (existingCartTitles.length > 0) {
      const dups = await batchDedupCheck(
        surviving.map((p) => p.title),
        existingCartTitles,
      );
      if (dups.length > 0) {
        const skippedTitles = await showDedupDialog(dups, 'cart');
        surviving = surviving.filter((p) => !skippedTitles.has(p.title));
      }
    }

    if (surviving.length === 0) return;

    setCart((prev) => {
      const existing = new Set(prev.map((p) => p.paper_id));
      const newPapers = surviving.filter((p) => !existing.has(p.paper_id));
      return [...prev, ...newPapers];
    });

    batchFetchCitations(surviving);
  }, [projectId, cart, cartIds, batchDedupCheck, showDedupDialog, batchFetchCitations]);

  const removeFromCart = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setCart((prev) => prev.filter((p) => !idSet.has(p.paper_id)));
  }, []);

  // ── Upload papers ──

  const handleUploadPapers = async (files: FileList) => {
    if (!projectId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      const res = await fetch(`${API}/projects/${projectId}/upload-papers`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.errors && data.errors.length > 0) {
        for (const err of data.errors) {
          addToast(`${err.filename}: ${err.error}`, 'error');
        }
      }

      if (data.uploaded && data.uploaded.length > 0) {
        const newPapers: Paper[] = data.uploaded.map((fname: string) => {
          const title = fname.replace(/\.pdf$/i, '');
          return {
            paper_id: sanitizeTitle(title),
            title,
            authors: [],
            year: null,
            venue: null,
            abstract: null,
            citation_count: null,
            source: 'user_provided',
            pdf_url: null,
            indexed: false,
          };
        });
        await addToCart(newPapers);
        addToast(`Uploaded ${data.uploaded.length} PDF(s)`, 'success');
      }
    } catch {
      addToast('Failed to upload files', 'error');
    } finally {
      setUploading(false);
    }
  };


  // ── Ideas ──

  const handleAssignToIdea = async (ideaSlug: string, papers: Paper[]) => {
    if (!projectId) return;

    // Stage 3: Dedup against existing idea pool
    const idea = ideas.find((i) => i.idea_slug === ideaSlug);
    if (idea && idea.papers.length > 0) {
      const existingTitles = idea.papers.map((p) => p.title);
      const dups = await batchDedupCheck(
        papers.map((p) => p.title),
        existingTitles,
      );
      if (dups.length > 0) {
        const skippedTitles = await showDedupDialog(dups, 'idea pool');
        papers = papers.filter((p) => !skippedTitles.has(p.title));
      }
    }

    if (papers.length === 0) return;

    await fetch(`${API}/projects/${projectId}/ideas/${ideaSlug}/papers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ papers }),
    });
    await refreshProject();
    addToast(`Assigned ${papers.length} paper(s) to idea`, 'success');
  };

  const handleNewIdea = async (text: string, papers: Paper[]) => {
    if (!projectId) return;
    const res = await fetch(`${API}/projects/${projectId}/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea_text: text }),
    });
    const data = await res.json();
    if (papers.length > 0) {
      await handleAssignToIdea(data.idea_slug, papers);
    }
    await refreshProject();
  };

  const handleDeleteIdea = async (slug: string) => {
    if (!projectId) return;
    await fetch(`${API}/projects/${projectId}/ideas/${slug}`, { method: 'DELETE' });
    await refreshProject();
    addToast('Idea deleted', 'info');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Delete overlay */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-white rounded-xl p-6 shadow-xl flex items-center gap-4">
            <svg className="animate-spin h-6 w-6 text-red-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-gray-700 font-medium">Deleting project...</span>
          </div>
        </div>
      )}

      {/* Upload overlay */}
      {uploading && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-white rounded-xl p-6 shadow-xl flex items-center gap-4">
            <svg className="animate-spin h-6 w-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-gray-700 font-medium">Uploading PDFs...</span>
          </div>
        </div>
      )}

      <Header
        projects={projects}
        projectId={projectId}
        onSelect={handleSelectProject}
        onCreate={handleCreateProject}
        onRefresh={fetchProjects}
        onDelete={handleDeleteProject}
      />
      <StatusBar busy={busyState} progress={globalProgress} />
      {projectId ? (
        <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
          {projectLoading && (
            <div className="flex items-center gap-2 text-sm text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100">
              <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Loading project...</span>
            </div>
          )}
          <UsageSummary projectId={projectId} refreshTrigger={usageRefresh} />
          <SourceTable projectId={projectId} onAddToCart={addToCart} cartIds={cartIds} />
          <CartPanel
            projectId={projectId}
            cart={cart}
            ideas={ideas}
            onRemove={removeFromCart}
            onAssign={handleAssignToIdea}
            onNewIdea={handleNewIdea}
            onUploadPapers={handleUploadPapers}
          />
          <ChatPanel
            projectId={projectId}
            ideas={ideas}
            addListener={addListener}
          />
          <IdeaAccordion
            projectId={projectId}
            ideas={ideas}
            busy={busyState}
            loading={projectLoading}
            onDeleteIdea={handleDeleteIdea}
            onAddToCart={addToCart}
            addListener={addListener}
            onRefresh={refreshProject}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400 gap-3">
          <svg className="w-16 h-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p className="text-lg font-medium">Select or create a project to get started</p>
          <p className="text-sm">Use the header above to open an existing project or create a new one.</p>
        </div>
      )}
      {dedupDialog && (
        <DedupWarningDialog
          open={true}
          items={dedupDialog.items}
          contextLabel={dedupDialog.contextLabel}
          onConfirm={dedupDialog.onConfirm}
          onCancel={dedupDialog.onCancel}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}