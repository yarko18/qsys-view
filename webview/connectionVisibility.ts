// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysConnection } from '../parser/graph';

export function visibleConnections(
  connections: readonly QsysConnection[],
  disabledIds: ReadonlySet<string>,
): QsysConnection[] {
  return connections.filter(({ id }) => !disabledIds.has(id));
}

export function moduleConnections(
  connections: readonly QsysConnection[],
  moduleId: string,
): QsysConnection[] {
  return connections.filter(({ source, target }) => source === moduleId || target === moduleId);
}

export function activeConnections(
  connections: readonly QsysConnection[],
  disabledIds: ReadonlySet<string>,
): QsysConnection[] {
  return connections.filter(({ id }) => !disabledIds.has(id));
}

export function disabledConnections(
  connections: readonly QsysConnection[],
  disabledIds: ReadonlySet<string>,
): QsysConnection[] {
  return connections.filter(({ id }) => disabledIds.has(id));
}
