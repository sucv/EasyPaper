import React, { useState, useEffect, useRef, useCallback } from 'react';
import MarkdownViewer from './MarkdownViewer';
import type { ChatSession, ChatMessage, IdeaState, WsEvent } from '../types';

const API = '/api';

interface Props {
  projectId: string;
  ideas: IdeaState[];
  addListener: (fn: (e: WsEvent) => void) => () => void;
}

function ChatBubble({ msg, index, projectId }: { msg: ChatMessage; index: number; projectId: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <div className={`group flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg text-sm ${
        msg.role === 'user'
          ? 'bg-indigo-600 text-white rounded-br-sm'
          : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
      }`}>
        <div className="px-4 py-3">
          {msg.role === 'assistant' ? (
            <MarkdownViewer content={msg.content} projectId={projectId} />
          ) : (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          )}
        </div>
        <div className={`flex px-3 pb-2 pt-0 opacity-0 group-hover:opacity-100 transition-opacity ${
          msg.role === 'user' ? 'justify-end' : 'justify-start'
        }`}>
          <button
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              msg.role === 'user'
                ? 'text-indigo-200 hover:text-white hover:bg-indigo-500'
                : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
            }`}
            onClick={() => {
              navigator.clipboard.writeText(msg.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            title="Copy to clipboard"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Copied
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatPanel({ projectId, ideas, addListener }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [scope, setScope] = useState('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  // Fetch sessions on mount
  useEffect(() => {
    if (projectId) fetchSessions();
  }, [projectId]);

  // Listen for chat events
  useEffect(() => {
    const unsub = addListener((e) => {
      if (e.type === 'chat_status' && e.thread_id === activeThread) {
        setStatusMsg(e.message || '');
      }
      if (e.type === 'chat_response' && e.thread_id === activeThread) {
        setStatusMsg('');
      }
    });
    return unsub;
  }, [activeThread, addListener]);

  // Scroll to bottom within the chat container only (not the page)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, statusMsg]);


  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(`${API}/projects/${projectId}/chat/sessions`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {} finally {
      setSessionsLoading(false);
    }
  };

  const loadSession = async (threadId: string) => {
    setActiveThread(threadId);
    try {
      const res = await fetch(`${API}/projects/${projectId}/chat/sessions/${threadId}/messages`);
      const data = await res.json();
      setMessages(data.messages || []);
      // Load scope from session
      const session = sessions.find(s => s.thread_id === threadId);
      if (session) setScope(session.scope);
    } catch {}
  };

  const createNewSession = async () => {
    try {
      const res = await fetch(`${API}/projects/${projectId}/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      const session = await res.json();
      await fetchSessions();
      setActiveThread(session.thread_id);
      setMessages([]);
    } catch {}
  };

  const deleteSession = async (threadId: string) => {
    if (!confirm('Delete this conversation?')) return;
    await fetch(`${API}/projects/${projectId}/chat/sessions/${threadId}`, { method: 'DELETE' });
    if (activeThread === threadId) {
      setActiveThread(null);
      setMessages([]);
    }
    await fetchSessions();
  };

  const updateScope = async (newScope: string) => {
    setScope(newScope);
    if (activeThread) {
      await fetch(`${API}/projects/${projectId}/chat/sessions/${activeThread}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: newScope }),
      });
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    if (!activeThread) {
      await createNewSession();
      // Wait for state update then retry
      return;
    }

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setSending(true);
    setStatusMsg('Thinking...');

    try {
      const res = await fetch(`${API}/projects/${projectId}/chat/sessions/${activeThread}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, scope }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);

      // Refresh sessions to get updated title
      if (data.title) {
        setSessions((prev) =>
          prev.map((s) => s.thread_id === activeThread ? { ...s, title: data.title, message_count: (s.message_count || 0) + 2 } : s)
        );
      }
      await fetchSessions();
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: failed to get response.' }]);
    } finally {
      setSending(false);
      setStatusMsg('');
    }
  };

  // Auto-create session on first message if none active
  const handleSend = async () => {
    if (!input.trim() || sending) return;

    let threadId = activeThread;

    // Auto-create session if none active
    if (!threadId) {
      try {
        const res = await fetch(`${API}/projects/${projectId}/chat/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope }),
        });
        const session = await res.json();
        threadId = session.thread_id;
        setActiveThread(threadId);
        await fetchSessions();
      } catch {
        return;
      }
    }

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setSending(true);
    setStatusMsg('Thinking...');

    try {
      const res = await fetch(`${API}/projects/${projectId}/chat/sessions/${threadId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, scope }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);

      if (data.title) {
        setSessions((prev) =>
          prev.map((s) => s.thread_id === threadId ? { ...s, title: data.title, message_count: (s.message_count || 0) + 2 } : s)
        );
      }
      await fetchSessions();
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: failed to get response.' }]);
    } finally {
      setSending(false);
      setStatusMsg('');
    }
  };


  const activeSession = sessions.find((s) => s.thread_id === activeThread);
  const totalMessages = sessions.reduce((s, sess) => s + sess.message_count, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="text-base font-semibold text-gray-900">Paper QA</span>
          {sessions.length > 0 && (
            <span className="text-xs text-gray-400">{sessions.length} conversation{sessions.length !== 1 ? 's' : ''} · {totalMessages} messages</span>
          )}
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100">
          {/* Session bar */}
          <div className="px-5 py-2.5 bg-gray-50/60 border-b border-gray-100 flex items-center gap-2 flex-wrap">
            {sessionsLoading ? (
              <div className="flex items-center gap-2 animate-pulse w-full">
                <div className="w-48 h-8 bg-gray-200 rounded-md" />
                <div className="w-16 h-8 bg-gray-200 rounded-md" />
                <div className="ml-auto flex items-center gap-2">
                  <div className="w-12 h-4 bg-gray-200 rounded" />
                  <div className="w-32 h-8 bg-gray-200 rounded-md" />
                </div>
              </div>
            ) : (
              <>
                <select
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 max-w-[240px]"
                  value={activeThread || ''}
                  onChange={(e) => e.target.value && loadSession(e.target.value)}
                >
                  <option value="">Select conversation...</option>
                  {sessions.map((s) => (
                    <option key={s.thread_id} value={s.thread_id}>
                      {s.title} ({s.message_count} msgs)
                    </option>
                  ))}
                </select>

                <button
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md text-xs font-medium"
                  onClick={createNewSession}
                >
                  + New
                </button>

                {activeThread && (
                  <button
                    className="text-red-500 hover:text-red-700 text-xs font-medium"
                    onClick={() => deleteSession(activeThread)}
                  >
                    Delete
                  </button>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-gray-500">Scope:</span>
                  <select
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-xs bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={scope}
                    onChange={(e) => updateScope(e.target.value)}
                  >
                    <option value="all">All Papers</option>
                    {ideas.map((idea) => (
                      <option key={idea.idea_slug} value={`idea:${idea.idea_slug}`}>
                        {idea.idea_text.slice(0, 40)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Messages area */}
          <div ref={messagesContainerRef} className="h-[420px] overflow-y-auto px-5 py-4 space-y-4 bg-slate-50/30">
            {messages.length === 0 && !sending && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <p className="text-sm font-medium">Ask a question about your papers</p>
                <p className="text-xs">The agent will search across {scope === 'all' ? 'all indexed papers' : 'scoped papers'} to find answers.</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <ChatBubble key={i} msg={msg} index={i} projectId={projectId} />
            ))}

            {statusMsg && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-500 rounded-bl-sm shadow-sm flex items-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {statusMsg}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className="px-5 py-3 border-t border-gray-200 bg-white">
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
                placeholder={activeThread ? "Ask about your papers..." : "Start a new conversation..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={sending}
              />
              <button
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                onClick={handleSend}
                disabled={sending || !input.trim()}
              >
                {sending ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                )}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}