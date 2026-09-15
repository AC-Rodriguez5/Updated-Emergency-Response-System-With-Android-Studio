import { Dialog } from '@headlessui/react';
import { useEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '@/api';
import { label } from '@/utils/format';
import type { PageMeta } from '@/types';

export function PageHeader({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  useEffect(() => { document.title = `${title} · SafeAlert`; }, [title]);
  return <header className="page-heading"><div><p className="eyebrow">SafeAlert operations</p><h1>{title}</h1><p className="muted">{description}</p></div><div className="actions">{children}</div></header>;
}
export function Loading({ text = 'Loading records…' }: { text?: string }) { return <div className="state-panel" role="status"><span className="spinner" aria-hidden="true" /><p>{text}</p></div>; }
export function Empty({ title = 'No records found', text = 'Try another filter or check back for new activity.' }: { title?: string; text?: string }) { return <div className="state-panel"><span className="empty-symbol" aria-hidden="true">✓</span><h3>{title}</h3><p className="muted">{text}</p></div>; }
export function ErrorPanel({ error, retry }: { error: string; retry?: () => void }) { return <div className="notice danger-notice" role="alert"><div><strong>Unable to complete request</strong><p>{error}</p></div>{retry && <button className="button outline" onClick={retry}>Try again</button>}</div>; }
export function Badge({ value, registration = false }: { value: string; registration?: boolean }) { return <span className={`badge badge-${value}`}>{registration && value === 'pending' ? 'Pending review' : label(value)}</span>; }
export function Select({ label: name, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) { const id = useId(); return <label className="field" htmlFor={id}><span>{name}</span><select id={id} {...props}>{children}</select></label>; }
export function Detail({ label: name, children }: { label: string; children?: ReactNode }) { return <div className="detail"><dt>{name}</dt><dd>{children || 'Not provided'}</dd></div>; }
export function Modal({ title, children, onClose, initialFocus, wide = false }: { title: string; children: ReactNode; onClose: () => void; initialFocus?: React.MutableRefObject<HTMLElement | null>; wide?: boolean }) {
  return <Dialog open onClose={onClose} initialFocus={initialFocus} className="modal-root"><div className="modal-backdrop" aria-hidden="true" /><div className="modal-position"><Dialog.Panel className={`modal-panel ${wide ? 'modal-wide' : ''}`}><div className="modal-heading"><Dialog.Title as="h2">{title}</Dialog.Title><button type="button" className="button ghost" onClick={onClose} aria-label="Close dialog">Close</button></div>{children}</Dialog.Panel></div></Dialog>;
}
interface ActionDialogProps { title: string; description: string; actionLabel: string; onClose: () => void; onConfirm: (reason: string) => Promise<void>; reasonRequired?: boolean; minimumReasonLength?: number; reasonLabel?: string; danger?: boolean }
export function ActionDialog({ title, description, actionLabel, onClose, onConfirm, reasonRequired = false, minimumReasonLength = 1, reasonLabel = 'Reason', danger = false }: ActionDialogProps) {
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [discard, setDiscard] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null); const reasonRef = useRef<HTMLTextAreaElement | null>(null); const id = useId();
  const close = () => { if (busy) return; if (reason.trim()) setDiscard(true); else onClose(); };
  useEffect(() => { if (!reason) return; const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload); }, [reason]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    if (reasonRequired && reason.trim().length < minimumReasonLength) { setError(`Enter a reason of at least ${minimumReasonLength} characters so this decision can be reviewed in the audit log.`); reasonRef.current?.focus(); return; }
    setBusy(true); setError('');
    try { await onConfirm(reason.trim()); onClose(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <Modal title={title} onClose={close} initialFocus={cancelRef}><form noValidate onSubmit={submit}><div className="modal-body"><p>{description}</p><label className="field" htmlFor={id}><span>{reasonLabel}{reasonRequired ? ' (required)' : ' (optional)'}</span><textarea className="resize-none" id={id} ref={reasonRef} rows={5} maxLength={500} value={reason} style={{ resize: 'none' }} onChange={event => { setReason(event.target.value); setError(''); }} aria-invalid={!!error && reasonRequired && reason.trim().length < minimumReasonLength} aria-describedby={`${id}-hint ${id}-error`} disabled={busy} /></label><p id={`${id}-hint`} className="muted small">This decision and reason will be recorded. Maximum 500 characters.</p><div id={`${id}-error`} className="form-error" role={error ? 'alert' : undefined}>{error}</div></div><div className="modal-actions"><button ref={cancelRef} className="button outline" type="button" onClick={close} disabled={busy}>Keep unchanged</button><button className={`button ${danger ? 'danger' : ''}`} type="submit" disabled={busy} aria-busy={busy}>{busy && <span className="button-spinner" aria-hidden="true" />}{actionLabel}</button></div></form>{discard && <Modal title="Discard this reason?" onClose={() => setDiscard(false)}><div className="modal-body"><p>Your unsaved reason will be lost.</p></div><div className="modal-actions"><button className="button outline" onClick={() => setDiscard(false)}>Keep editing</button><button className="button danger" onClick={onClose}>Discard changes</button></div></Modal>}</Modal>;
}
export function Search({ value, onChange, placeholder = 'Search records' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value); const [composing, setComposing] = useState(false); const input = useRef<HTMLInputElement>(null); const id = useId();
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (composing || draft === value) return; const timer = setTimeout(() => onChange(draft.trim()), 300); return () => clearTimeout(timer); }, [draft, value, composing, onChange]);
  return <form className="search-form" noValidate role="search" onSubmit={event => { event.preventDefault(); if (!composing) onChange(draft.trim()); }}><label htmlFor={id}>Search</label><div className="search-control"><input ref={input} id={id} type="search" value={draft} placeholder={placeholder} onChange={event => setDraft(event.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} />{draft && <button className="search-clear" type="button" aria-label="Clear search" onClick={() => { setDraft(''); onChange(''); input.current?.focus(); }}>×</button>}</div></form>;
}
export function useTableState(defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams(); const [query, setQuery] = useState('');
  const page = Math.max(1, Number(params.get('page')) || 1); const limit = 20;
  const get = (key: string) => params.get(key) ?? defaults[key] ?? '';
  const set = (key: string, value: string) => { setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.set('page', '1'); return next; }); };
  const search = (value: string) => { setQuery(value); set('page', '1'); };
  return { page, limit, get, set, query, search };
}
export function Pagination({ meta, page, onPage, busy }: { meta?: PageMeta; page: number; onPage: (page: number) => void; busy: boolean }) {
  const total = meta?.total ?? 0; const limit = meta?.limit || 20; const pages = Math.max(1, Math.ceil(total / limit));
  useEffect(() => { if (meta && page > pages && !busy) onPage(pages); }, [meta, page, pages, busy, onPage]);
  return <nav className="pagination" aria-label="Record pagination"><p className="muted" aria-live="polite">{total ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total.toLocaleString('en-PH')} records` : '0 records'}</p><div className="actions"><button className="button outline" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>Previous</button><span>Page {Math.min(page, pages)} of {pages}</span><button className="button outline" disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>Next</button></div></nav>;
}
export function Table({ children, caption }: { children: ReactNode; caption: string }) { return <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}><table><caption className="sr-only">{caption}</caption>{children}</table></div>; }

