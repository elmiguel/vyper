// Vitest global setup. Registers jest-dom matchers (toBeInTheDocument, etc.)
// and cleans up the DOM between tests so renders don't leak across cases.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
