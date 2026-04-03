/**
 * Latency distribution histogram component
 * Extracted from SingleTest.tsx for reuse in ComparisonTest
 */
import { useTranslation } from 'react-i18next';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import type { Distribution } from '../types';

interface Props {
  distribution: Distribution | undefined;
}

export default function HistogramChart({ distribution }: Props) {
  const { t } = useTranslation();

  if (!distribution?.bins) return <div className="empty-state"><p>{t('components.distributionNoData')}</p></div>;
  const data = distribution.bins.map(b => ({ name: `${b.start.toFixed(1)}ms`, count: b.count }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="name" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
        <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
        <Tooltip contentStyle={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6 }} />
        <Bar dataKey="count" fill="var(--color-accent)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
