import { render, screen } from '@solidjs/testing-library';
import { expect, it } from 'vitest';
import App from './App';

it('renderiza a raiz do app', () => {
  render(() => <App />);
  expect(screen.getByTestId('app-root')).toBeInTheDocument();
});
