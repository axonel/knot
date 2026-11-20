import { ThreadlineApi } from '../../shared/types.js';

declare global {
  interface Window {
    threadlineApi?: ThreadlineApi;
  }
}

export {};
