/**
 * Tests for PercentilesTable component
 *
 * Verifies rendering of the percentiles table with
 * correct labels and values.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PercentilesTable from '../../components/PercentilesTable';
import type { Percentiles } from '../../types';

describe('PercentilesTable', () => {
  it('renders table with percentile rows', () => {
    const percentiles: Percentiles = {
      p01: 1.0,
      p05: 2.0,
      p10: 3.0,
      p25: 5.0,
      p50: 8.0,
      p75: 12.0,
      p90: 18.0,
      p95: 25.0,
      p99: 40.0,
      p999: 55.0,
    };

    render(<PercentilesTable percentiles={percentiles} />);

    // Check header
    expect(screen.getByText('パーセンタイル')).toBeInTheDocument();
    expect(screen.getByText('レイテンシ (ms)')).toBeInTheDocument();

    // Check percentile labels are rendered
    expect(screen.getByText('P1')).toBeInTheDocument();
    expect(screen.getByText('P5')).toBeInTheDocument();
    expect(screen.getByText('P10')).toBeInTheDocument();
    expect(screen.getByText('P25')).toBeInTheDocument();
    expect(screen.getByText('P50 (中央値)')).toBeInTheDocument();
    expect(screen.getByText('P75')).toBeInTheDocument();
    expect(screen.getByText('P90')).toBeInTheDocument();
    expect(screen.getByText('P99')).toBeInTheDocument();
    expect(screen.getByText('P99.9')).toBeInTheDocument();
  });

  it('displays correct values', () => {
    const percentiles: Percentiles = {
      p01: 1.5,
      p50: 10.2,
      p95: 25.7,
      p99: 42.3,
    };

    render(<PercentilesTable percentiles={percentiles} />);

    expect(screen.getByText('1.5')).toBeInTheDocument();
    expect(screen.getByText('10.2')).toBeInTheDocument();
    expect(screen.getByText('25.7')).toBeInTheDocument();
    expect(screen.getByText('42.3')).toBeInTheDocument();
  });

  it('handles missing percentiles with dash', () => {
    const percentiles: Percentiles = {
      p50: 10.0,
      // All other percentiles are undefined
    };

    render(<PercentilesTable percentiles={percentiles} />);

    expect(screen.getByText('10')).toBeInTheDocument();

    // Undefined values should show as '-'
    const dashes = screen.getAllByText('-');
    // 9 out of 10 rows should have '-' (only p50 has a value)
    expect(dashes.length).toBe(9);
  });

  it('returns null when percentiles is undefined', () => {
    const { container } = render(<PercentilesTable percentiles={undefined} />);

    expect(container.innerHTML).toBe('');
  });

  it('applies accent color to P95 row', () => {
    const percentiles: Percentiles = {
      p95: 20.5,
    };

    render(<PercentilesTable percentiles={percentiles} />);

    const p95Value = screen.getByText('20.5');
    expect(p95Value).toHaveStyle({ color: 'var(--color-accent)' });
  });
});
