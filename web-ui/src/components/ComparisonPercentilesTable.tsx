/**
 * ComparisonPercentilesTable - Side-by-side percentile comparison with delta
 */
import { useTranslation } from 'react-i18next';
import type { Percentiles } from '../types';

interface Props {
  percentilesA: Percentiles | undefined;
  percentilesB: Percentiles | undefined;
  nameA: string;
  nameB: string;
}

const ROWS: [string, keyof Percentiles][] = [
  ['P1', 'p01'],
  ['P5', 'p05'],
  ['P10', 'p10'],
  ['P25', 'p25'],
  ['P50', 'p50'],
  ['P75', 'p75'],
  ['P90', 'p90'],
  ['P95', 'p95'],
  ['P99', 'p99'],
  ['P99.9', 'p999'],
];

function fmt(v: number | undefined): string {
  return v != null ? v.toFixed(2) : '-';
}

export default function ComparisonPercentilesTable({ percentilesA, percentilesB, nameA, nameB }: Props) {
  const { t } = useTranslation();

  if (!percentilesA && !percentilesB) return null;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: 'right' }}>{nameA} (ms)</th>
            <th style={{ textAlign: 'center' }}>{t('common.percentile')}</th>
            <th style={{ textAlign: 'left' }}>{nameB} (ms)</th>
            <th style={{ textAlign: 'right' }}>{t('components.deltaMs')}</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, key]) => {
            const valA = percentilesA?.[key];
            const valB = percentilesB?.[key];
            const diff = (valA != null && valB != null) ? valB - valA : null;
            const highlight = key === 'p95';
            const diffColor = diff == null ? undefined
              : diff < -0.01 ? 'var(--color-success)'
              : diff > 0.01 ? 'var(--color-danger)'
              : undefined;

            return (
              <tr key={key}>
                <td className="font-mono" style={{
                  textAlign: 'right',
                  color: highlight ? 'var(--color-accent)' : undefined,
                }}>{fmt(valA)}</td>
                <td style={{ textAlign: 'center', fontWeight: highlight ? 600 : undefined }}>
                  {label}
                </td>
                <td className="font-mono" style={{
                  textAlign: 'left',
                  color: highlight ? 'var(--color-accent)' : undefined,
                }}>{fmt(valB)}</td>
                <td className="font-mono" style={{ textAlign: 'right', color: diffColor }}>
                  {diff != null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}` : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
