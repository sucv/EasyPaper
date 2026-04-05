import React, { useEffect } from 'react';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const typeStyles: Record<string, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-slate-700 text-white',
};

export default function ToastContainer({ toasts, onDismiss }: Props) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastEntry key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastEntry({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-sm flex items-center gap-3 ${typeStyles[toast.type]}`}>
      {toast.type === 'success' && <span>✓</span>}
      {toast.type === 'error' && <span>✕</span>}
      {toast.type === 'info' && <span>ℹ</span>}
      <span className="flex-1">{toast.message}</span>
      <button className="opacity-60 hover:opacity-100 text-lg leading-none" onClick={() => onDismiss(toast.id)}>×</button>
    </div>
  );
}