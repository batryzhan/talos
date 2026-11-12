// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { FleetTable } from '../../src/features/telemetry/FleetTable';
import { buildFleetRows, createTrendBuffers, rhoTone, stateTone, type FleetRow, type FleetSource } from '../../src/features/telemetry/rows';

const row = (over: Partial<FleetRow>): FleetRow => ({
  id: 1, team: 'Alpha', state: 'TRANSPORT', force: 58.9, height: 100, battery: 0.92, batteryTrend: [0.93, 0.92],
  eh: 0.12, ehTrend: [0.1, 0.12], rho: 0.31, epoch: 3, ...over,
});

const ROWS: FleetRow[] = [
  row({ id: 1, force: 58.9 }),
  row({ id: 2, force: 120.4, state: 'HOLD' }),
  row({ id: 15, team: null, state: 'READY', force: null, eh: null, ehTrend: [], rho: null, epoch: null, battery: 0.2 }),
];

function renderTable(onSelect = vi.fn(), selectedId: number | null = null) {
  render(<TooltipProvider><FleetTable rows={ROWS} selectedId={selectedId} onSelect={onSelect} /></TooltipProvider>);
  return onSelect;
}

const bodyRows = (): HTMLElement[] => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('FleetTable', () => {
  it('renders one row per robot with status badges, units and placeholders', () => {
    renderTable();
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('ID'), expect.stringContaining('Бригада'), expect.stringContaining('F_i'), expect.stringContaining('Н')]),
    );
    const rows = bodyRows();
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('HOLD')).toBeInTheDocument();
    expect(within(rows[1]).getByText('120.4')).toBeInTheDocument();
    // Reserve robot: no team, no force → muted placeholders, low battery highlighted.
    expect(within(rows[2]).getByText('резерв')).toBeInTheDocument();
    expect(within(rows[2]).getAllByText('—').length).toBeGreaterThan(0);
    expect(within(rows[2]).getByText('20.0')).toHaveClass('text-warning');
  });

  it('sorts by a numeric column (largest first) and announces it with aria-sort', async () => {
    const user = userEvent.setup();
    renderTable();
    const sortForce = screen.getByRole('button', { name: 'Сортировать по F_i' });
    await user.click(sortForce);
    // Numeric columns sort descending first: the most loaded support is on top.
    expect(bodyRows().map(r => r.getAttribute('aria-label'))).toEqual(['Робот #2', 'Робот #1', 'Робот #15']);
    expect(sortForce.closest('th')).toHaveAttribute('aria-sort', 'descending');
    await user.click(sortForce);
    expect(bodyRows().map(r => r.getAttribute('aria-label'))).toEqual(['Робот #1', 'Робот #2', 'Робот #15']);
    expect(sortForce.closest('th')).toHaveAttribute('aria-sort', 'ascending'); // missing values stay last either way
  });

  it('selects a robot by click and by keyboard, and highlights the selection', async () => {
    const user = userEvent.setup();
    const onSelect = renderTable(vi.fn(), 2);
    expect(bodyRows()[1]).toHaveAttribute('aria-selected', 'true');
    expect(bodyRows()[0]).toHaveAttribute('aria-selected', 'false');
    await user.click(bodyRows()[0]);
    expect(onSelect).toHaveBeenLastCalledWith(1);
    bodyRows()[2].focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith(15);
  });
});

describe('fleet rows', () => {
  const source: FleetSource = {
    agents: [
      { id: 1, mode: 'TRANSPORT', battery: 0.9, lift: { h: 0.1 } },
      { id: 2, mode: 'LIFT', battery: 0.8, lift: { h: 0.05 } },
      { id: 3, mode: 'READY', battery: 1, lift: { h: 0 } },
    ],
    contacts: [{ agentId: 1, force: 60 }, { agentId: 2, force: 55 }],
    teamOf: id => (id < 3 ? 'Alpha' : undefined),
    teamMetrics: () => ({ eh: 0.4, rho: 0.02, epoch: 5 }),
  };

  it('joins contacts and team metrics and converts to display units', () => {
    const rows = buildFleetRows(source, createTrendBuffers());
    expect(rows[0]).toMatchObject({ id: 1, team: 'Alpha', force: 60, height: 100, eh: 0.4, rho: 0.02, epoch: 5 });
    expect(rows[2]).toMatchObject({ id: 3, team: null, force: null, eh: null, rho: null, epoch: null });
  });

  it('keeps bounded battery and E_h trends across polls', () => {
    const trends = createTrendBuffers();
    for (let i = 0; i < 6; i++) buildFleetRows(source, trends, 4);
    const rows = buildFleetRows(source, trends, 4);
    expect(rows[0].batteryTrend).toHaveLength(4);
    expect(rows[0].ehTrend).toHaveLength(4);
    expect(rows[2].ehTrend).toEqual([]);
  });

  it('maps states and stability margins to status tones', () => {
    expect(stateTone('READY')).toBe('success');
    expect(stateTone('TRANSPORT')).toBe('info');
    expect(stateTone('LIFT')).toBe('info');
    expect(stateTone('HOLD')).toBe('destructive');
    expect(stateTone('APPROACH')).toBe('warning');
    expect(rhoTone(0.05)).toBe('success');
    expect(rhoTone(0.01)).toBe('warning');
    expect(rhoTone(-0.01)).toBe('destructive');
    expect(rhoTone(null)).toBe('neutral');
  });
});
