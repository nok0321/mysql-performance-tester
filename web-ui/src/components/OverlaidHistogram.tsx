/**
 * OverlaidHistogram - Two distributions overlaid on a single bar chart
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { Distribution } from '../types';

interface Props {
  distributionA: Distribution | undefined;
  distributionB: Distribution | undefined;
  nameA: string;
  nameB: string;
}

export default function OverlaidHistogram({ distributionA, distributionB, nameA, nameB }: Props) {
  const bucketsA = distributionA?.buckets;
  const bucketsB = distributionB?.buckets;

  if (!bucketsA && !bucketsB) {
    return <div className="empty-state"><p>分布データなし</p></div>;
  }

  // Build a unified set of bucket labels from both distributions
  const labelMap = new Map<string, { countA: number; countB: number }>();

  bucketsA?.forEach(b => {
    const label = `${b.min?.toFixed(0)}`;
    const entry = labelMap.get(label) || { countA: 0, countB: 0 };
    entry.countA = b.count;
    labelMap.set(label, entry);
  });

  bucketsB?.forEach(b => {
    const label = `${b.min?.toFixed(0)}`;
    const entry = labelMap.get(label) || { countA: 0, countB: 0 };
    entry.countB = b.count;
    labelMap.set(label, entry);
  });

  // Sort by numeric value of label
  const data = Array.from(labelMap.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([label, counts]) => ({
      name: `${label}ms`,
      [nameA]: counts.countA,
      [nameB]: counts.countB,
    }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="name" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
        <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
        <Tooltip contentStyle={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6 }} />
        <Legend />
        <Bar dataKey={nameA} fill="var(--color-accent)" fillOpacity={0.6} radius={[3, 3, 0, 0]} />
        <Bar dataKey={nameB} fill="var(--color-warning)" fillOpacity={0.6} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
