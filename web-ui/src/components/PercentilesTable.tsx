/**
 * Reusable percentiles table component
 * Displays P1 through P99.9 latency values
 */
import type { Percentiles } from '../types';

interface Props {
  percentiles: Percentiles | undefined;
}

export default function PercentilesTable({ percentiles }: Props) {
  if (!percentiles) return null;

  const rows: [string, number | undefined][] = [
    ['P1', percentiles.p01],
    ['P5', percentiles.p05],
    ['P10', percentiles.p10],
    ['P25', percentiles.p25],
    ['P50 (中央値)', percentiles.p50],
    ['P75', percentiles.p75],
    ['P90', percentiles.p90],
    ['P95 ⭐', percentiles.p95],
    ['P99', percentiles.p99],
    ['P99.9', percentiles.p999],
  ];

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>パーセンタイル</th>
            <th>レイテンシ (ms)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, val]) => (
            <tr key={label}>
              <td>{label}</td>
              <td
                className="font-mono"
                style={{ color: (label as string).includes('⭐') ? 'var(--color-accent)' : undefined }}
              >
                {val ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
