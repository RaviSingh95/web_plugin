import { useState } from 'react';

interface Props {
  onSave: (text: string) => void;
  onCancel: () => void;
  initial?: string;
  placeholder?: string;
  /** Shown above the text box, e.g. the video time the note will be linked to. */
  context?: string;
}

export function Composer({ onSave, onCancel, initial = '', placeholder = 'Write a note…', context }: Props) {
  const [text, setText] = useState(initial);
  const save = () => {
    if (text.trim()) onSave(text.trim());
  };

  return (
    <div className="composer">
      {context && <span className="muted">{context}</span>}
      <textarea
        autoFocus
        rows={3}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="composer-actions">
        <span className="muted hint">#tags · ⌘/Ctrl+Enter to save</span>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" disabled={!text.trim()} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
