import React, { useEffect, useState } from 'react';

interface Props {
  projects: string[];
  projectId: string | null;
  onSelect: (pid: string) => void;
  onCreate: (name?: string) => void;
  onRefresh: () => void;
  onDelete: () => void;
}

export default function Header({ projects, projectId, onSelect, onCreate, onRefresh, onDelete }: Props) {
  const [newName, setNewName] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { onRefresh(); }, []);

  return (
    <header className="bg-slate-900 text-white px-8 py-3.5 flex items-center gap-4 shadow-md">
      <div className="flex items-center gap-2.5 mr-6">
        <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <h1 className="text-lg font-bold tracking-tight">Research Copilot</h1>
      </div>

      <select
        className="bg-slate-800 border border-slate-700 text-white px-3 py-1.5 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent cursor-pointer"
        value={projectId || ''}
        onChange={(e) => e.target.value && onSelect(e.target.value)}
      >
        <option value="">Select Project...</option>
        {projects.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      {!showCreate ? (
        <button
          className="bg-indigo-600 hover:bg-indigo-500 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors"
          onClick={() => setShowCreate(true)}
        >
          + New Project
        </button>
      ) : (
        <div className="flex gap-2 items-center">
          <input
            className="bg-slate-800 border border-slate-600 px-3 py-1.5 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400"
            placeholder="Project name"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { onCreate(newName || undefined); setNewName(''); setShowCreate(false); }
              if (e.key === 'Escape') { setNewName(''); setShowCreate(false); }
            }}
          />
          <button
            className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-md text-sm font-medium"
            onClick={() => { onCreate(newName || undefined); setNewName(''); setShowCreate(false); }}
          >
            Create
          </button>
          <button className="text-sm text-slate-400 hover:text-white" onClick={() => setShowCreate(false)}>Cancel</button>
        </div>
      )}

      {projectId && (
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400 font-medium tracking-wide uppercase">
            Project: <span className="text-slate-200">{projectId}</span>
          </span>
          <button
            className="text-xs text-slate-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-slate-800"
            onClick={() => {
              if (confirm(`⚠️ Delete project "${projectId}"?\n\nThis will permanently remove ALL data including:\n• Indexed papers and tree indexes\n• All ideas, retrieval files, and reports\n• Chat history and conversations\n• Usage tracking data\n\nThis action cannot be undone.`)) {
                onDelete();
              }
            }}
            title="Delete this project"
          >
            🗑 Delete Project
          </button>
        </div>
      )}
    </header>
  );
}