/**
 * Tests for StatCardsGrid component
 *
 * Verifies rendering of stat cards with labels, values,
 * units, and highlight behavior.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatCardsGrid from '../../components/StatCardsGrid';
import type { StatCardItem } from '../../types';

describe('StatCardsGrid', () => {
  it('renders all stat cards with labels and values', () => {
    const items: StatCardItem[] = [
      { label: 'Mean', value: 12.5, unit: 'ms' },
      { label: 'Median', value: 11.0, unit: 'ms' },
      { label: 'P95', value: 18.3, unit: 'ms' },
    ];

    render(<StatCardsGrid items={items} />);

    expect(screen.getByText('Mean')).toBeInTheDocument();
    expect(screen.getByText('Median')).toBeInTheDocument();
    expect(screen.getByText('P95')).toBeInTheDocument();
    expect(screen.getByText('12.5')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('18.3')).toBeInTheDocument();
  });

  it('handles null/undefined values gracefully', () => {
    const items: StatCardItem[] = [
      { label: 'Mean', value: null, unit: 'ms' },
      { label: 'Median', value: undefined, unit: 'ms' },
      { label: 'Count', value: 0, unit: '' },
    ];

    render(<StatCardsGrid items={items} />);

    // null/undefined should render as '-'
    const dashes = screen.getAllByText('-');
    expect(dashes).toHaveLength(2);

    // 0 should still render as a value
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('applies accent color when highlight is true', () => {
    const items: StatCardItem[] = [
      { label: 'Fast', value: 5.0, unit: 'ms', highlight: true },
      { label: 'Normal', value: 10.0, unit: 'ms' },
    ];

    const { container } = render(<StatCardsGrid items={items} />);

    const statValues = container.querySelectorAll('.stat-value');
    // First card has highlight
    expect(statValues[0]).toHaveStyle({ color: 'var(--color-accent)' });
    // Second card does not
    expect(statValues[1]).not.toHaveStyle({ color: 'var(--color-accent)' });
  });

  it('renders string values', () => {
    const items: StatCardItem[] = [
      { label: 'Status', value: 'OK', unit: '' },
    ];

    render(<StatCardsGrid items={items} />);

    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('uses specified column count', () => {
    const items: StatCardItem[] = [
      { label: 'A', value: 1, unit: '' },
    ];

    const { container } = render(<StatCardsGrid items={items} columns={3} />);

    const grid = container.querySelector('.card-grid');
    expect(grid).toHaveClass('card-grid-3');
  });
});
