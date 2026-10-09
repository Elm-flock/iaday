import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { __resetNextHeaders } from './mocks/next-headers';

afterEach(() => {
  cleanup();
  __resetNextHeaders();
});
