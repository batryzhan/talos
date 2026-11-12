// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { ControllerSelect } from '../../src/features/controls/ExperimentCard';
import { useUiStore } from '../../src/store/ui';

describe('ControllerSelect', () => {
  beforeEach(() => useUiStore.setState({ controller: 'C', lang: 'ru' }));

  const renderSelect = (disabled = false): void => {
    render(<TooltipProvider><ControllerSelect disabled={disabled} /></TooltipProvider>);
  };

  it('shows the current controller with a readable label', () => {
    renderSelect();
    expect(screen.getByRole('combobox', { name: 'Контроллер' })).toHaveTextContent('C — децентрализованный');
  });

  it('writes the chosen controller to the UI store', async () => {
    const user = userEvent.setup();
    renderSelect();
    await user.click(screen.getByRole('combobox', { name: 'Контроллер' }));
    const options = screen.getAllByRole('option').map(o => o.textContent);
    expect(options).toEqual(['A — независимый', 'B — централизованный', 'C — децентрализованный']);
    await user.click(screen.getByRole('option', { name: 'B — централизованный' }));
    expect(useUiStore.getState().controller).toBe('B');
    expect(screen.getByRole('combobox', { name: 'Контроллер' })).toHaveTextContent('B — централизованный');
  });

  it('follows the store when the gamepad (X button) changes the controller', async () => {
    renderSelect();
    useUiStore.getState().setController('A');
    expect(await screen.findByText('A — независимый')).toBeInTheDocument();
  });

  it('follows the language', async () => {
    renderSelect();
    useUiStore.getState().setLang('en');
    expect(await screen.findByRole('combobox', { name: 'Controller' })).toHaveTextContent('C — decentralised');
  });

  it('can be disabled', () => {
    renderSelect(true);
    expect(screen.getByRole('combobox', { name: 'Контроллер' })).toBeDisabled();
  });
});
