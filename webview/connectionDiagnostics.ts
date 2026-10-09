// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysConnection, QsysDiagnostic } from '../parser/graph';

function normalizedParameterName(name: string): string {
  return name.toLowerCase().replaceAll('_', '');
}

function connectionParameter(connection: QsysConnection, name: string): string | undefined {
  const expected = normalizedParameterName(name);
  return Object.entries(connection.parameters).find(([candidate]) =>
    normalizedParameterName(candidate) === expected,
  )?.[1];
}

function canonicalAddress(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/.test(normalized)) return undefined;
  try {
    return `0x${BigInt(normalized).toString(16)}`;
  } catch {
    return undefined;
  }
}

function endpoint(connection: QsysConnection, side: 'source' | 'target'): string {
  return side === 'source'
    ? `${connection.source}.${connection.sourcePort}`
    : `${connection.target}.${connection.targetPort}`;
}

function naturalList(values: readonly string[]): string {
  if (values.length < 2) return values.join('');
  return `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;
}

function avalonMmAddressDiagnostics(connections: readonly QsysConnection[]): QsysDiagnostic[] {
  const mappings = new Map<string, Map<string, Set<string>>>();
  for (const connection of connections) {
    if (connection.kind !== 'avalon_memory_mapped') continue;
    const rawAddress = connectionParameter(connection, 'baseAddress');
    const address = rawAddress === undefined ? undefined : canonicalAddress(rawAddress);
    if (address === undefined) continue;

    const master = endpoint(connection, 'source');
    const targetsByAddress = mappings.get(master) ?? new Map<string, Set<string>>();
    const targets = targetsByAddress.get(address) ?? new Set<string>();
    targets.add(endpoint(connection, 'target'));
    targetsByAddress.set(address, targets);
    mappings.set(master, targetsByAddress);
  }

  return [...mappings.entries()].flatMap(([master, targetsByAddress]) =>
    [...targetsByAddress.entries()].flatMap(([address, targetSet]) => {
      const targets = [...targetSet].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
      if (targets.length < 2) return [];
      return [{
        severity: 'warning' as const,
        message: `Avalon-MM master ${master} maps ${naturalList(targets)} to the same base address ${address}.`,
      }];
    }),
  );
}

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
  return [...inputErrors, ...outputErrors, ...avalonMmAddressDiagnostics(connections)];
}
