import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';

/**
 * A dropdown anchored to the element that opened it. Rendered in a portal so a
 * menu opened inside a scrolling board is never clipped by it.
 */
export default function Menu({ anchorRef, title, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const menu = ref.current;
    if (!anchor || !menu) return;
    const a = anchor.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = menu;
    const left = Math.max(8, Math.min(a.left, window.innerWidth - w - 8));
    const top = a.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, a.top - h - 6) : a.bottom + 6;
    setPos({ top, left });
  }, [anchorRef, items]);

  useEffect(() => {
    const onPointer = (e) => {
      if (!ref.current?.contains(e.target) && !anchorRef.current?.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div className="menu" role="menu" ref={ref} style={{ top: pos.top, left: pos.left }}>
      {title && <div className="menu-t">{title}</div>}
      {items.map((item, i) =>
        item.separator ? (
          <div className="menu-sep" key={`sep-${i}`} />
        ) : (
          <button
            type="button"
            role="menuitem"
            className="menu-i"
            key={item.key ?? item.label}
            onClick={() => { onClose(); item.onSelect?.(); }}
            style={item.danger ? { color: 'var(--bad)' } : undefined}
          >
            {item.color && <span className="sw" style={{ background: item.color }} />}
            {item.personId != null && <Avatar personId={item.personId} size="sm" />}
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
            {item.checked && <span className="tick"><Icon name="check" size={14} /></span>}
          </button>
        )
      )}
    </div>,
    document.body
  );
}

/** Wires a trigger button to a menu without every caller repeating the state. */
export function useMenu() {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  return { anchorRef, open, openMenu: () => setOpen(true), closeMenu: () => setOpen(false), setOpen };
}
