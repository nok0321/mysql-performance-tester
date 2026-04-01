/**
 * TimelineChart - Line chart showing query metrics over time
 * with event annotations (e.g., index added) as reference lines
 */
import { useTranslation } from 'react-i18next';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { QueryHistoryEntry, QueryEvent } from '../types';

interface Props {
  entries: QueryHistoryEntry[];
  events: QueryEvent[];
}

const EVENT_COLORS: Record<string, string> = {
  index_added: 'var(--color-success)',
  index_removed: 'var(--color-danger)',
  schema_change: 'var(--color-warning)',
  config_change: 'var(--color-accent)',
  custom: 'var(--color-text-muted)',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

export default function TimelineChart({ entries, events }: Props) {
  const { t } = useTranslation();

  if (entries.length === 0) {
    return <div className="empty-state"><p>{t('components.timelineNoData')}</p></div>;
  }

  const data = entries.map(e => ({
    timestamp: e.timestamp,
    label: formatDate(e.timestamp),
    mean: e.statistics?.basic?.mean ?? null,
    p50: e.statistics?.percentiles?.p50 ?? null,
    p95: e.statistics?.percentiles?.p95 ?? null,
    p99: e.statistics?.percentiles?.p99 ?? null,
  }));

  // Map events to their x-axis positions (closest entry timestamp)
  const eventLines = events.map(ev => {
    const evTime = new Date(ev.timestamp).getTime();
    let closestLabel = data[0]?.label ?? '';
    let minDist = Infinity;
    for (const d of data) {
      const dist = Math.abs(new Date(d.timestamp).getTime() - evTime);
      if (dist < minDist) {
        minDist = dist;
        closestLabel = d.label;
      }
    }
    return { ...ev, closestLabel };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
        />
        <YAxis
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          label={{ value: 'ms', position: 'insideLeft', style: { fill: 'var(--color-text-muted)', fontSize: 11 } }}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
          }}
          formatter={(value: number) => [`${value?.toFixed(2)} ms`]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />

        <Line type="monotone" dataKey="mean" stroke="var(--color-accent)" name="Mean" dot={{ r: 3 }} strokeWidth={2} connectNulls />
        <Line type="monotone" dataKey="p50" stroke="#60a5fa" name="P50" dot={{ r: 2 }} strokeWidth={1.5} connectNulls />
        <Line type="monotone" dataKey="p95" stroke="#f59e0b" name="P95" dot={{ r: 2 }} strokeWidth={1.5} connectNulls />
        <Line type="monotone" dataKey="p99" stroke="#ef4444" name="P99" dot={{ r: 2 }} strokeWidth={1.5} connectNulls />

        {eventLines.map(ev => (
          <ReferenceLine
            key={ev.id}
            x={ev.closestLabel}
            stroke={EVENT_COLORS[ev.type] || 'var(--color-text-muted)'}
            strokeDasharray="5 3"
            strokeWidth={2}
            label={{
              value: ev.label,
              position: 'top',
              fill: EVENT_COLORS[ev.type] || 'var(--color-text-muted)',
              fontSize: 11,
            }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
