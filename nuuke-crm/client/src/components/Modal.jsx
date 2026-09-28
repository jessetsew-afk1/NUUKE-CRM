import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ title, hint, children, onClose, labelledBy = 'modal-title' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="scrim" style={{ zIndex: 94 }} onClick={onClose} />
      <div className="modal-wrap" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2 id={labelledBy}>{title}</h2>
          {hint && <p className="hint">{hint}</p>}
          {children}
        </div>
      </div>
    </>,
    document.body
  );
}
