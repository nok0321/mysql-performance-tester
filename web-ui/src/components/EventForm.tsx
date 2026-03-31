/**
 * EventForm - Inline form to add timeline event annotations
 * (e.g., "Index added on users.email")
 */
import { useState } from 'react';
import type { QueryEventType } from '../types';

interface Props {
  queryFingerprint: string;
  onSubmit: (data: { label: string; type: QueryEventType; timestamp: string }) => Promise<void>;
}

const EVENT_TYPES: { value: QueryEventType; label: string }[] = [
  { value: 'index_added', label: 'Index Added' },
  { value: 'index_removed', label: 'Index Removed' },
  { value: 'schema_change', label: 'Schema Change' },
  { value: 'config_change', label: 'Config Change' },
  { value: 'custom', label: 'Custom' },
];

function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function EventForm({ onSubmit }: Props) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<QueryEventType>('index_added');
  const [timestamp, setTimestamp] = useState(nowLocal);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        label: label.trim(),
        type,
        timestamp: new Date(timestamp).toISOString(),
      });
      setLabel('');
      setTimestamp(nowLocal());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto auto auto',
      gap: 'var(--space-2)',
      alignItems: 'end',
    }}>
      <div>
        <label className="form-label">Event Label</label>
        <input
          className="form-input"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g., Added index on users.email"
          required
        />
      </div>
      <div>
        <label className="form-label">Type</label>
        <select className="form-input" value={type} onChange={e => setType(e.target.value as QueryEventType)}>
          {EVENT_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="form-label">Timestamp</label>
        <input
          className="form-input"
          type="datetime-local"
          value={timestamp}
          onChange={e => setTimestamp(e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={submitting || !label.trim()}>
        {submitting ? '...' : 'Add'}
      </button>
    </form>
  );
}
