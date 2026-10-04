import { useState } from 'react';

export interface PickerOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  title: string;
  options: PickerOption[];
  onPick: (id: string) => void;
  onClose: () => void;
  emptyText?: string;
  /** When given, shows a field for creating a new option. */
  onCreate?: (name: string) => void;
  createPlaceholder?: string;
}

export function PickerDialog({ title, options, onPick, onClose, emptyText, onCreate, createPlaceholder }: Props) {
  const [filter, setFilter] = useState('');
  const [name, setName] = useState('');
  const shown = options.filter((o) =>
    `${o.label} ${o.sublabel ?? ''}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="dialog" role="dialog" aria-label={title}>
        <header className="dialog-header">
          <h2>{title}</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        {options.length > 6 && (
          <input
            className="search"
            autoFocus
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
        <ul className="picker-list">
          {shown.map((option) => (
            <li key={option.id}>
              <button onClick={() => onPick(option.id)}>
                <span className="picker-label">{option.label}</span>
                {option.sublabel && <span className="muted">{option.sublabel}</span>}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="muted picker-empty">{emptyText ?? 'Nothing to choose from.'}</li>}
        </ul>
        {onCreate && (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onCreate(name.trim());
            }}
          >
            <input
              autoFocus={options.length <= 6}
              placeholder={createPlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="btn primary small" disabled={!name.trim()}>
              Create
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
