// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

export type ScheduledTask = (signal: AbortSignal) => Promise<void>;

interface ScheduledTaskState {
  timer?: NodeJS.Timeout;
  ready: boolean;
  running: boolean;
  latest?: ScheduledTask;
  controller?: AbortController;
}

/**
 * Debounces keyed work, keeps only the latest request, and never runs two
 * tasks for the same key at once. A replacement aborts the task currently
 * running for that key so subprocess-backed work can stop promptly.
 */
export class LatestTaskScheduler {
  private readonly states = new Map<string, ScheduledTaskState>();
  private disposed = false;

  constructor(private readonly delayMs: number) {}

  schedule(key: string, task: ScheduledTask): void {
    if (this.disposed) return;
    const state = this.states.get(key) ?? { ready: false, running: false };
    this.states.set(key, state);
    state.latest = task;
    state.ready = false;
    state.controller?.abort();
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.timer = undefined;
      state.ready = true;
      void this.run(key, state);
    }, this.delayMs);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const state of this.states.values()) {
      if (state.timer) clearTimeout(state.timer);
      state.controller?.abort();
      state.latest = undefined;
      state.ready = false;
    }
    this.states.clear();
  }

  private async run(key: string, state: ScheduledTaskState): Promise<void> {
    if (this.disposed || state.running || !state.ready || !state.latest) return;
    const task = state.latest;
    const controller = new AbortController();
    state.latest = undefined;
    state.ready = false;
    state.running = true;
    state.controller = controller;
    try {
      await task(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      state.running = false;
      if (state.controller === controller) state.controller = undefined;
      if (!this.disposed) {
        if (state.ready && state.latest) {
          void this.run(key, state);
        } else if (!state.timer && !state.latest) {
          this.states.delete(key);
        }
      }
    }
  }
}
