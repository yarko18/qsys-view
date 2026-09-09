// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';
import { LatestTaskScheduler } from '../src/latestTaskScheduler';

describe('LatestTaskScheduler', () => {
  it('debounces repeated work and runs only the latest task', async () => {
    vi.useFakeTimers();
    const scheduler = new LatestTaskScheduler(250);
    const calls: string[] = [];
    scheduler.schedule('file', async () => { calls.push('first'); });
    scheduler.schedule('file', async () => { calls.push('second'); });

    await vi.advanceTimersByTimeAsync(250);

    expect(calls).toEqual(['second']);
    scheduler.dispose();
    vi.useRealTimers();
  });

  it('aborts running work and serialises its replacement', async () => {
    vi.useFakeTimers();
    const scheduler = new LatestTaskScheduler(250);
    const calls: string[] = [];
    let finishFirst: (() => void) | undefined;
    scheduler.schedule('file', (signal) => new Promise<void>((resolve) => {
      calls.push('first');
      finishFirst = resolve;
      signal.addEventListener('abort', () => calls.push('aborted'), { once: true });
    }));
    await vi.advanceTimersByTimeAsync(250);

    scheduler.schedule('file', async () => { calls.push('second'); });
    await vi.advanceTimersByTimeAsync(250);
    expect(calls).toEqual(['first', 'aborted']);

    finishFirst?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['first', 'aborted', 'second']);
    scheduler.dispose();
    vi.useRealTimers();
  });
});
