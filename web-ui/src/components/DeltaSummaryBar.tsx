/**
 * DeltaSummaryBar - Shows comparison winner and key delta metrics
 */
import { useTranslation } from 'react-i18next';
import type { ComparisonDelta } from '../types';

interface Props {
  delta: ComparisonDelta;
  nameA: string;
  nameB: string;
}

function DeltaChip({ label, diff, pct }: { label: string; diff: number; pct: number }) {
  const isBetter = diff < 0;  // negative = B is faster (lower latency)
  const color = Math.abs(pct) < 1 ? 'var(--color-text-muted)' : isBetter ? 'var(--color-success)' : 'var(--color-danger)';
  const sign = diff >= 0 ? '+' : '';
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono" style={{ color, fontSize: 'var(--text-sm)' }}>
        {sign}{diff.toFixed(2)}ms ({sign}{pct.toFixed(1)}%)
      </div>
    </div>
  );
}

export default function DeltaSummaryBar({ delta, nameA, nameB }: Props) {
  const { t } = useTranslation();

  const winnerLabel = delta.winner === 'tie'
    ? t('components.deltaTie')
    : delta.winner === 'A' ? nameA : nameB;
  const winnerColor = delta.winner === 'tie'
    ? 'var(--color-text-muted)'
    : 'var(--color-success)';

  return (
    <div className="card mb-4 fade-in" style={{
      borderLeft: `4px solid ${winnerColor}`,
      display: 'grid',
      gridTemplateColumns: '1fr repeat(3, auto)',
      gap: 'var(--space-4)',
      alignItems: 'center',
    }}>
      <div>
        <div className="text-xs text-muted">{t('components.deltaWinner')}</div>
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: winnerColor }}>
          {winnerLabel}
        </div>
        <div className="text-xs text-muted">{delta.summary}</div>
      </div>
      <DeltaChip label={t('components.deltaMean')} diff={delta.meanDiff} pct={delta.meanDiffPercent} />
      <DeltaChip label={t('components.deltaP95')} diff={delta.p95Diff} pct={delta.p95DiffPercent} />
      <DeltaChip label={t('components.deltaP99')} diff={delta.p99Diff} pct={delta.p99DiffPercent} />
    </div>
  );
}
