/**
 * Reusable stat cards grid component
 * Used by SingleTest and ParallelTest for summary metrics display
 */
import type { StatCardItem } from '../types';

interface Props {
  items: StatCardItem[];
  columns?: number;
}

export default function StatCardsGrid({ items, columns = 4 }: Props) {
  return (
    <div className={`card-grid card-grid-${columns} mb-4 fade-in`}>
      {items.map(s => (
        <div key={s.label} className="stat-card">
          <div className="stat-label">{s.label}</div>
          <div className="stat-value" style={{ color: s.highlight ? 'var(--color-accent)' : undefined }}>
            {s.value ?? '-'}
            <span className="stat-unit">{s.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
