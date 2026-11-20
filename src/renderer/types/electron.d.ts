import { KnotApi } from '../../shared/types.js';

declare global {
  interface Window {
    knotApi?: KnotApi;
  }
}

export {};
