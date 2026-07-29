// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { ConnectionKind, QsysConnection, QsysGraph, QsysModule } from '../parser/graph';

export const hubKinds = [
  'avalon_memory_mapped',
  'clock',
  'reset',
  'interrupt',
] as const satisfies readonly ConnectionKind[];

export type HubKind = (typeof hubKinds)[number];

export interface InterfaceHub {
  id: string;
  kind: HubKind;
  endpoint: string;
  moduleId: string;
  port: string;
  relatedModuleIds: string[];
  connections: QsysConnection[];
  frequency?: string;
}

export function createInterfaceHubs(
  graph: QsysGraph,
  selectedKinds: ConnectionKind[],
  allowedIds: Set<string>,
): InterfaceHub[] {
  const enabledKinds = new Set(selectedKinds.filter(isHubKind));
  const groups = new Map<string, InterfaceHub>();
  for (const connection of graph.connections) {
    if (!isHubKind(connection.kind)
      || !enabledKinds.has(connection.kind)
      || !allowedIds.has(connection.source)
      || !allowedIds.has(connection.target)) continue;

    const incoming = connection.kind === 'interrupt';
    const rawModuleId = incoming ? connection.target : connection.source;
    const rawPort = incoming ? connection.targetPort : connection.sourcePort;
    const relatedModuleId = incoming ? connection.source : connection.target;
    const rawEndpoint = `${rawModuleId}.${rawPort}`;
    const endpoint = connection.kind === 'clock' || connection.kind === 'reset'
      ? canonicalDomainEndpoint(graph, rawEndpoint)
      : rawEndpoint;
    const { moduleId, port } = splitEndpoint(endpoint);
    const id = `${connection.kind}:${endpoint}`;
    const existing = groups.get(id);
    if (existing) {
      existing.connections.push(connection);
      if (!existing.relatedModuleIds.includes(relatedModuleId)) existing.relatedModuleIds.push(relatedModuleId);
      continue;
    }
    groups.set(id, {
      id,
      kind: connection.kind,
      endpoint,
      moduleId,
      port,
      relatedModuleIds: [relatedModuleId],
      connections: [connection],
      frequency: connection.kind === 'clock' ? clockFrequency(graph, moduleId, port) : undefined,
    });
  }
  const kindOrder = new Map(hubKinds.map((kind, index) => [kind, index]));
  return [...groups.values()].sort((left, right) =>
    (kindOrder.get(left.kind) ?? 0) - (kindOrder.get(right.kind) ?? 0)
    || left.endpoint.localeCompare(right.endpoint),
  );
}

function canonicalDomainEndpoint(graph: QsysGraph, endpoint: string): string {
  const visited = new Set<string>();
  let current = endpoint;
  while (graph.domainAliases?.[current] && !visited.has(current)) {
    visited.add(current);
    current = graph.domainAliases[current]!;
  }
  return current;
}

function splitEndpoint(endpoint: string): { moduleId: string; port: string } {
  const separator = endpoint.lastIndexOf('.');
  return separator < 0
    ? { moduleId: endpoint, port: '' }
    : { moduleId: endpoint.slice(0, separator), port: endpoint.slice(separator + 1) };
}

export function connectionAddress(connection: QsysConnection): string | undefined {
  const entry = Object.entries(connection.parameters).find(([name]) =>
    name.toLowerCase().replaceAll('_', '') === 'baseaddress',
  );
  return entry?.[1] || undefined;
}

function isHubKind(kind: ConnectionKind): kind is HubKind {
  return (hubKinds as readonly ConnectionKind[]).includes(kind);
}

function clockFrequency(graph: QsysGraph, moduleId: string, port: string): string | undefined {
  const module = graph.modules.find((candidate) => candidate.id === moduleId);
  if (!module) return undefined;
  const known = parameter(module, ['clockFrequencyKnown', 'frequencyKnown']);
  if (known !== undefined && ['0', 'false', 'no', 'off'].includes(known.toLowerCase())) return undefined;

  const iface = graph.interfaces[`${moduleId}.${port}`];
  const value = parameterRecord(iface?.parameters ?? {}, [
    'clockRate',
    'clockFrequency',
    'frequency',
  ]) ?? parameter(module, [
    'clockFrequency',
    'clockRate',
    'CLOCK_RATE',
  ]);
  if (!value) return undefined;
  const hertz = Number(value);
  if (!Number.isFinite(hertz) || hertz <= 0) return undefined;
  return formatFrequency(hertz);
}

function parameter(module: QsysModule, names: string[]): string | undefined {
  return parameterRecord(module.parameters, names);
}

function parameterRecord(parameters: Record<string, string>, names: string[]): string | undefined {
  const expected = new Set(names.map((name) => name.toLowerCase().replaceAll('_', '')));
  return Object.entries(parameters).find(([name]) =>
    expected.has(name.toLowerCase().replaceAll('_', '')),
  )?.[1];
}

function formatFrequency(hertz: number): string {
  const scales: Array<[number, string]> = [
    [1_000_000_000, 'GHz'],
    [1_000_000, 'MHz'],
    [1_000, 'kHz'],
  ];
  for (const [scale, unit] of scales) {
    if (hertz >= scale) return `${Number((hertz / scale).toFixed(3))} ${unit}`;
  }
  return `${Number(hertz.toFixed(3))} Hz`;
}
