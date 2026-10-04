import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  /** Shows a checkmark column when defined. */
  checked?: boolean;
  hidden?: boolean;
}

interface Props {
  items: (MenuItem | 'separator')[];
  title: string;
  label?: ReactNode;
}

export function Menu({ items, title, label = '⋯' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        className="icon-btn"
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <div className="menu-popover" role="menu">
          {items.map((item, i) =>
            item === 'separator' ? (
              <hr key={i} />
            ) : item.hidden ? null : (
              <button
                key={i}
                role="menuitem"
                className={item.danger ? 'danger' : undefined}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.checked !== undefined && <span className="check">{item.checked ? '✓' : ''}</span>}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
