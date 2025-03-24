import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/vue';

// Runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});
