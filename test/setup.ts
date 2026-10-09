import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { __resetNextHeaders } from './mocks/next-headers';

// jsdom no implementa <dialog>.showModal/close. Polyfill mínimo que imita al navegador:
// showModal marca `open`, close lo quita y dispara `close`, y Esc dispara `cancel` + close.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
    const top = open[open.length - 1];
    if (top && top.dispatchEvent(new Event('cancel', { cancelable: true }))) top.close();
  });
}

afterEach(() => {
  cleanup();
  __resetNextHeaders();
});
