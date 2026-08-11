// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysConnection, QsysDiagnostic } from '../parser/graph';

/** Reports topology errors that are meaningful only after connections are composed. */
export function connectionDiagnostics(connections: readonly QsysConnection[]): QsysDiagnostic[] {
  const streamingInputs = new Map<string, QsysConnection[]>();
  const streamingOutputs = new Map<string, QsysConnection[]>();
  for (const connection of connections) {
    if (connection.kind !== 'avalon_streaming') continue;
    const input = `${connection.target}.${connection.targetPort}`;
    const output = `${connection.source}.${connection.sourcePort}`;
    streamingInputs.set(input, [...(streamingInputs.get(input) ?? []), connection]);
    streamingOutputs.set(output, [...(streamingOutputs.get(output) ?? []), connection]);
  }

  const inputErrors = [...streamingInputs.entries()].flatMap(([endpoint, group]) => {
    if (group.length < 2) return [];
    const sources = [...new Set(group.map((connection) => `${connection.source}.${connection.sourcePort}`))];
    return [{
      severity: 'error' as const,
      message: `Avalon-ST sink ${endpoint} has ${group.length} incoming connections (${sources.join(', ')}). Avalon-ST must be point-to-point.`,
    }];
  });
  const outputErrors = [...streamingOutputs.entries()].flatMap(([endpoint, group]) => {
    if (group.length < 2) return [];
    const targets = [...new Set(group.map((connection) => `${connection.target}.${connection.targetPort}`))];
    return [{
      severity: 'error' as const,
      message: `Avalon-ST source ${endpoint} has ${group.length} outgoing connections (${targets.join(', ')}). Avalon-ST must be point-to-point.`,
    }];
  });
  return [...inputErrors, ...outputErrors];
}
