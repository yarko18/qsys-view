// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { ConnectionKind } from '../parser/graph';

export type GraphViewMode = 'pipeline' | 'complete';

const directKinds: Record<GraphViewMode, ReadonlySet<ConnectionKind>> = {
  pipeline: new Set(['avalon_streaming', 'conduit', 'other']),
  complete: new Set(['avalon_streaming', 'avalon_memory_mapped', 'interrupt', 'conduit', 'other']),
};

const hubKinds: Record<GraphViewMode, ReadonlySet<ConnectionKind>> = {
  pipeline: new Set(['avalon_memory_mapped', 'clock', 'reset', 'interrupt']),
  complete: new Set(['clock', 'reset']),
};

export function isDirectKind(kind: ConnectionKind, mode: GraphViewMode): boolean {
  return directKinds[mode].has(kind);
}

export function isHubKind(kind: ConnectionKind, mode: GraphViewMode): boolean {
  return hubKinds[mode].has(kind);
}
