// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

declare module 'elkjs/lib/elk.bundled.js' {
  import ELK from 'elkjs';
  export default ELK;
}
