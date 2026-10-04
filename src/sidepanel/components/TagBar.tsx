interface Props {
  tags: [string, number][];
  active: string[];
  onToggle: (tag: string) => void;
}

export function TagBar({ tags, active, onToggle }: Props) {
  if (tags.length === 0) return null;
  return (
    <div className="chips" aria-label="Filter by tag">
      {tags.map(([tag, count]) => (
        <button
          key={tag}
          className={`chip tag${active.includes(tag) ? ' active' : ''}`}
          aria-pressed={active.includes(tag)}
          onClick={() => onToggle(tag)}
        >
          #{tag} <span className="chip-count">{count}</span>
        </button>
      ))}
    </div>
  );
}
