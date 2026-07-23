// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysModule } from './graph';

const relevantPattern = /(?:bits?.*symbol|symbols?.*beat|data.*width|ready.*latency|use.*ready|packet|sop|eop|empty|channel|color.*plane|parallel.*pixel|pixels.*parallel)/i;

export function streamParameters(module: QsysModule): Record<string, string> {
  return Object.fromEntries(
    Object.entries(module.parameters).filter(([name]) => relevantPattern.test(name)),
  );
}
