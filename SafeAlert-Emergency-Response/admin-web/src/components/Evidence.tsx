import { useEffect, useState } from 'react';
import { privateDocument, errorMessage } from '@/api';
import { Modal, ErrorPanel, Loading } from './UI';
export default function Evidence({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null); const [mime, setMime] = useState(''); const [error, setError] = useState(''); const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl: string | undefined;
    setUrl(null); setError('');
    privateDocument(id, controller.signal).then(blob => { if (controller.signal.aborted) return; if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(blob.type.split(';')[0])) throw new Error('This document type cannot be previewed safely. Ask the applicant to provide a JPEG, PNG, WebP or PDF.'); objectUrl = URL.createObjectURL(blob); setMime(blob.type); setUrl(objectUrl); }).catch(cause => { if (!controller.signal.aborted) setError(errorMessage(cause)); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, version]);
  return <Modal title={name} onClose={onClose} wide><div className="modal-body"><p className="notice">Private registration evidence. Use only to verify this application.</p>{error ? <ErrorPanel error={error} retry={() => setVersion(value => value + 1)} /> : !url ? <Loading text="Loading private evidence…" /> : mime.startsWith('image/') ? <img className="evidence-image" src={url} alt={name} /> : <><p>PDF evidence is available as a private attachment. <a href={url} download={`${name}.pdf`}>download it for review</a>.</p></>}</div></Modal>;
}

