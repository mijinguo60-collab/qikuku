'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock3, Loader2, MessageSquarePlus, Search } from 'lucide-react';

export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount?: number | string;
}

interface ConversationHistoryProps {
  mode: 'knowledge' | 'skill' | 'image' | 'unified';
  activeSessionId: string | null;
  refreshKey: number;
  // eslint-disable-next-line no-unused-vars
  onSelect: (sessionId: string) => Promise<void>;
  onCreate: () => Promise<ConversationSummary | null>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export default function ConversationHistory({ mode, activeSessionId, refreshKey, onSelect, onCreate }: ConversationHistoryProps) {
  const [sessions, setSessions] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const initializedRef = useRef(false);

  async function loadSessions(initial = false) {
    try {
      const response = await fetch(`/api/chat-sessions?mode=${mode}`);
      const data = await response.json();
      if (!response.ok) return;
      const nextSessions = data.sessions || [];
      setSessions(nextSessions);
      if (initial && !initializedRef.current) {
        initializedRef.current = true;
        if (nextSessions[0]) await onSelect(nextSessions[0].id);
        else await createConversation();
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSessions(!initializedRef.current);
    // Parent callbacks intentionally remain stable per page lifecycle; refreshKey triggers updates after a reply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, refreshKey]);

  async function createConversation() {
    const session = await onCreate();
    if (!session) return;
    setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
  }

  const visibleSessions = sessions.filter((session) => !search.trim() || (session.title || '新对话').toLowerCase().includes(search.trim().toLowerCase()));
  const list = visibleSessions.length ? visibleSessions.map((session) => (
    <button
      key={session.id}
      onClick={() => void onSelect(session.id)}
      className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${activeSessionId === session.id ? 'bg-surface-tertiary text-text-primary' : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'}`}
    >
      <span className="block text-xs font-medium truncate">{session.title || '新对话'}</span>
      <span className="block text-[10px] text-text-muted mt-1">{formatDate(session.updatedAt)} · {Number(session.messageCount || 0)} 条消息</span>
    </button>
  )) : <p className="px-3 py-6 text-xs text-text-muted text-center">{sessions.length ? '没有匹配的对话' : '暂无历史对话'}</p>;

  return (
    <>
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col border-r border-border-light bg-white/70 px-3 py-4">
        <button onClick={() => void createConversation()} className="btn-secondary text-xs flex items-center justify-center gap-1.5 mb-4">
          <MessageSquarePlus className="w-3.5 h-3.5" /> 新建对话
        </button>
        <label className="relative block mb-3">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索会话" className="w-full rounded-lg border border-border-light bg-white py-1.5 pl-8 pr-2 text-[11px] outline-none focus:border-border-medium" />
        </label>
        <div className="flex items-center gap-1.5 px-2 mb-2 text-[11px] font-medium text-text-muted"><Clock3 className="w-3.5 h-3.5" /> 历史对话</div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {loading ? <Loader2 className="w-4 h-4 animate-spin text-text-muted mx-auto mt-4" /> : list}
        </div>
      </aside>
      <details className="md:hidden border-b border-border-light bg-white px-4 py-2">
        <summary className="cursor-pointer text-xs font-medium text-text-secondary">历史对话</summary>
        <label className="relative block mt-2 mb-2"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索会话" className="w-full rounded-lg border border-border-light bg-white py-1.5 pl-8 pr-2 text-[11px] outline-none" /></label>
        <div className="mt-2 max-h-48 overflow-y-auto space-y-1">{loading ? <Loader2 className="w-4 h-4 animate-spin text-text-muted mx-auto my-3" /> : list}</div>
        <button onClick={() => void createConversation()} className="btn-secondary text-xs w-full mt-2">新建对话</button>
      </details>
    </>
  );
}
