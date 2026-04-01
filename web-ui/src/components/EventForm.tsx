/**
 * EventForm - Inline form to add timeline event annotations
 * (e.g., "Index added on users.email")
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QueryEventType } from '../types';

interface Props {
  queryFingerprint: string;
  onSubmit: (data: { label: string; type: QueryEventType; timestamp: string }) => Promise<void>;
}

function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function EventForm({ onSubmit }: Props) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const [type, setType] = useState<QueryEventType>('index_added');
  const [timestamp, setTimestamp] = useState(nowLocal);
  const [submitting, setSubmitting] = useState(false);

  const EVENT_TYPES: { value: QueryEventType; label: string }[] = [
    { value: 'index_added', label: t('history.indexAdded') },
    { value: 'index_removed', label: t('history.indexRemoved') },
    { value: 'schema_change', label: t('history.schemaChange') },
    { value: 'config_change', label: t('history.configChange') },
    { value: 'custom', label: t('history.custom') },
  ];

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
        <label className="form-label">{t('history.eventLabel')}</label>
        <input
          className="form-input"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder={t('history.eventLabelPlaceholder')}
          required
        />
      </div>
      <div>
        <label className="form-label">{t('history.eventType')}</label>
        <select className="form-input" value={type} onChange={e => setType(e.target.value as QueryEventType)}>
          {EVENT_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="form-label">{t('history.eventTimestamp')}</label>
        <input
          className="form-input"
          type="datetime-local"
          value={timestamp}
          onChange={e => setTimestamp(e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={submitting || !label.trim()}>
        {submitting ? t('history.eventSubmitting') : t('history.eventAdd')}
      </button>
    </form>
  );
}
