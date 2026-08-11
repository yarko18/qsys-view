// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysConnection, QsysDiagnostic } from '../parser/graph';

/** Reports topology errors that are meaningful only after connections are composed. */
export function connectionDiagnostics(connections: readonly QsysConnection[]): QsysDiagnostic[] {
  const streamingInputs = new Map<string, QsysConnection[]>();
  for (const connection of connections) {
    if (connection.kind !== 'avalon_streaming') continue;
    const endpoint = `${connection.target}.${connection.targetPort}`;
    streamingInputs.set(endpoint, [...(streamingInputs.get(endpoint) ?? []), connection]);
  }

  return [...streamingInputs.entries()].flatMap(([endpoint, group]) => {
    if (group.length < 2) return [];
    const sources = [...new Set(group.map((connection) => `${connection.source}.${connection.sourcePort}`))];
    return [{
      severity: 'error' as const,
      message: `Avalon-ST sink ${endpoint} has ${group.length} incoming connections (${sources.join(', ')}). Avalon-ST must be point-to-point.`,
    }];
  });
}
