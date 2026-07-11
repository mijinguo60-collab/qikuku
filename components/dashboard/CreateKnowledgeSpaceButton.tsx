'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderPlus, Loader2, X } from 'lucide-react';

export default function CreateKnowledgeSpaceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function closeDialog() {
    if (submitting) return;
    setOpen(false);
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError('请输入空间名称');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/knowledge-spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, enabled }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || '创建失败，请稍后重试');
        return;
      }
      router.push(`/dashboard/knowledge-spaces/${data.space.id}`);
      router.refresh();
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-sm flex items-center gap-2">
        <FolderPlus className="w-4 h-4" /> 创建空间
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/20 p-4" role="presentation" onMouseDown={closeDialog}>
          <form
            onSubmit={handleSubmit}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-lg card p-6 shadow-hover"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-space-title"
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 id="create-space-title" className="text-lg font-semibold text-text-primary">创建知识空间</h2>
                <p className="text-xs text-text-muted mt-1">按主题沉淀资料，方便团队统一检索与问答。</p>
              </div>
              <button type="button" onClick={closeDialog} className="p-1.5 rounded-lg hover:bg-surface-hover" aria-label="关闭">
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-text-primary">空间名称</span>
                <input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="input-primary mt-2" placeholder="例如：销售资料库" maxLength={100} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-text-primary">空间描述</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="input-primary mt-2 min-h-24 resize-y" placeholder="简要说明这个空间适合沉淀哪些资料" maxLength={500} />
              </label>
              <label className="flex items-center justify-between gap-4 rounded-xl bg-surface-secondary px-4 py-3 cursor-pointer">
                <span>
                  <span className="block text-sm font-medium text-text-primary">启用 AI 问答</span>
                  <span className="block text-xs text-text-muted mt-0.5">开启后，该空间的资料可用于企业 AI 问答。</span>
                </span>
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-4 w-4 accent-text-primary" />
              </label>
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={closeDialog} className="btn-secondary text-sm">取消</button>
              <button type="submit" disabled={submitting} className="btn-primary text-sm flex items-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />} 创建空间
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
