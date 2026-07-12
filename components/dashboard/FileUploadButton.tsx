'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, Upload, X } from 'lucide-react';
import { useCreditBalance } from '@/hooks/useCreditBalance';

interface KnowledgeSpaceOption {
  id: string;
  name: string;
}

const ACCEPTED_FILE_TYPES = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.markdown,.csv,.json';

export default function FileUploadButton({ spaces }: { spaces: KnowledgeSpaceOption[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [knowledgeSpaceId, setKnowledgeSpaceId] = useState(spaces[0]?.id || '');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [creditNotice, setCreditNotice] = useState('');
  const { updateCredits } = useCreditBalance();

  function openDialog() {
    setError('');
    if (spaces.length === 0) {
      setOpen(true);
      return;
    }
    setKnowledgeSpaceId((current) => current || spaces[0].id);
    setOpen(true);
  }

  function closeDialog() {
    if (uploading) return;
    setOpen(false);
    setError('');
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] || null);
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('请选择要上传的文件');
      return;
    }
    if (!knowledgeSpaceId) {
      setError('请选择知识空间');
      return;
    }

    setUploading(true);
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('knowledgeSpaceId', knowledgeSpaceId);

    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || '上传失败，请稍后重试');
        return;
      }
      setFile(null);
      if (data.chargedCredits > 0 && typeof data.remainingCredits === 'number') { updateCredits(data.remainingCredits); setCreditNotice(`本次消耗${data.chargedCredits}积分，剩余${data.remainingCredits.toLocaleString()}积分`); }
      if (fileInputRef.current) fileInputRef.current.value = '';
      setOpen(false);
      router.refresh();
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <button onClick={openDialog} className="btn-primary text-sm flex items-center gap-2">
        <Upload className="w-4 h-4" /> 上传文件
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/20 p-4" role="presentation" onMouseDown={closeDialog}>
          <form
            onSubmit={handleSubmit}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-lg card p-6 shadow-hover"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-file-title"
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 id="upload-file-title" className="text-lg font-semibold text-text-primary">上传企业资料</h2>
                <p className="text-xs text-text-muted mt-1">文件会归属到所选知识空间，并进入解析与知识库处理流程。</p>
              </div>
              <button type="button" onClick={closeDialog} className="p-1.5 rounded-lg hover:bg-surface-hover" aria-label="关闭">
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>

            {spaces.length === 0 ? (
              <div className="rounded-xl bg-surface-secondary p-5 text-center">
                <p className="text-sm font-medium text-text-primary">请先创建知识空间</p>
                <p className="text-xs text-text-muted mt-2">上传文件前，需要先确定资料归属的知识空间。</p>
                <Link href="/dashboard/knowledge-spaces" className="btn-primary text-sm inline-flex mt-4">前往创建知识空间</Link>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-medium text-text-primary">知识空间</span>
                    <select value={knowledgeSpaceId} onChange={(event) => setKnowledgeSpaceId(event.target.value)} className="input-primary mt-2">
                      {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
                    </select>
                  </label>
                  <div>
                    <span className="block text-sm font-medium text-text-primary">选择文件</span>
                    <input ref={fileInputRef} type="file" accept={ACCEPTED_FILE_TYPES} onChange={handleFileChange} className="sr-only" />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-2 w-full rounded-xl border border-dashed border-border-medium bg-surface-secondary px-4 py-8 text-center hover:bg-surface-hover transition-colors">
                      <FileUp className="w-6 h-6 text-text-muted mx-auto mb-2" />
                      <span className="block text-sm text-text-primary">{file ? file.name : '选择要上传的文件'}</span>
                      <span className="block text-xs text-text-muted mt-1">PDF、Word、Excel、TXT、Markdown、CSV、JSON，最大 20MB</span>
                    </button>
                  </div>
                  {error && <p className="text-sm text-danger">{error}</p>}
                  {creditNotice && <p className="text-xs text-text-secondary">{creditNotice}</p>}
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <button type="button" onClick={closeDialog} className="btn-secondary text-sm">取消</button>
                  <button type="submit" disabled={uploading} className="btn-primary text-sm flex items-center gap-2">
                    {uploading && <Loader2 className="w-4 h-4 animate-spin" />} 开始上传
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}
