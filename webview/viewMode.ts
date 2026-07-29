// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { ConnectionKind, QsysConnection } from '../parser/graph';

export type GraphViewMode = 'pipeline' | 'complete';

const directKinds: Record<GraphViewMode, ReadonlySet<ConnectionKind>> = {
  pipeline: new Set(['avalon_streaming', 'conduit']),
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

export function availableConnectionKinds(
  kinds: readonly ConnectionKind[],
  mode: GraphViewMode,
): ConnectionKind[] {
  const existing = new Set(kinds);
  return [...existing].filter((kind) => isDirectKind(kind, mode) || isHubKind(kind, mode));
}

const resetInterfaceName = /(?:^|[_-])(?:reset_n|rst_n|reset|nrst|rstn|rst)(?=$|[_-])/i;
const clockInterfaceName = /(?:^|[_-])(?:clock|clk)(?=$|[_-])/i;

export function inferClockResetConnections(
  connections: readonly QsysConnection[],
  enabled: boolean,
): QsysConnection[] {
  if (!enabled) return [...connections];
  return connections.map((connection) => {
    if (connection.kind !== 'other' || connection.rawKind !== 'unknown (static Tcl)') return connection;
    const interfaceNames = [connection.sourcePort, connection.targetPort];
    const inferredKind = interfaceNames.some((name) => resetInterfaceName.test(name))
      ? 'reset'
      : interfaceNames.some((name) => clockInterfaceName.test(name))
        ? 'clock'
        : undefined;
    return inferredKind ? { ...connection, kind: inferredKind } : connection;
  });
}
