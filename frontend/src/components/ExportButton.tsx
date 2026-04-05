import React from 'react';

const API = '/api';

interface Props {
  projectId: string;
  ideaSlug: string;
  filename: string;
}

export default function ExportButton({ projectId, ideaSlug, filename }: Props) {
  const handleExport = async () => {
    const url = `${API}/projects/${projectId}/ideas/${ideaSlug}/export/${filename}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace('.md', '.zip');
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <button
      className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded px-2 py-0.5 text-xs font-medium"
      onClick={handleExport}
      title="Export as ZIP"
    >
      📥
    </button>
  );
}