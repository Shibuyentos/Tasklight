import '@testing-library/jest-dom/vitest';
import { cleanup } from '@solidjs/testing-library';
import { afterEach } from 'vitest';

// Sem `globals: true` no Vitest, a limpeza automática da Testing Library não é registrada.
afterEach(() => {
  cleanup();
});
