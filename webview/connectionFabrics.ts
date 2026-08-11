// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { ConnectionKind, QsysConnection, QsysModule } from '../parser/graph';

export interface ConnectionFabricEndpoint {
  moduleId: string;
  interfaceName: string;
  edgeId: string;
  connections: QsysConnection[];
}

export interface ConnectionFabric {
  id: string;
  kind: ConnectionKind;
  rawKind: string;
  connections: QsysConnection[];
  inputs: ConnectionFabricEndpoint[];
  outputs: ConnectionFabricEndpoint[];
}

export interface ConnectionFabricGraph {
  modules: QsysModule[];
  connections: QsysConnection[];
  fabrics: ConnectionFabric[];
}

const fabricType = 'qsys-view.connection-fabric';

/**
 * Replaces every non-P2P connected component with one explicit interconnect
 * node. Each source endpoint enters once and each target endpoint exits once,
 * so the layout engine never has to overlap independent source trees.
 */
export function createConnectionFabricGraph(
  modules: readonly QsysModule[],
  connections: readonly QsysConnection[],
): ConnectionFabricGraph {
  const components = fabricComponents(connections);
  const replacedIds = new Set(components.flatMap((component) => component.map(({ id }) => id)));
  const usedModuleIds = new Set(modules.map(({ id }) => id));
  const fabrics = components.map((component) => createFabric(component, usedModuleIds));
  const fabricModules = fabrics.map(fabricModule);
  const fabricConnections = fabrics.flatMap((fabric) => [
    ...fabric.inputs.map((endpoint) => fabricInputConnection(fabric, endpoint)),
    ...fabric.outputs.map((endpoint) => fabricOutputConnection(fabric, endpoint)),
  ]);
  return {
    modules: [...modules, ...fabricModules],
    connections: [
      ...connections.filter(({ id }) => !replacedIds.has(id)),
      ...fabricConnections,
    ],
    fabrics,
  };
}

export function isConnectionFabricModule(module: QsysModule): boolean {
  return module.type === fabricType;
}

function fabricComponents(connections: readonly QsysConnection[]): QsysConnection[][] {
  const candidates = connections.filter(({ kind, source, target }) =>
    source !== target
      && kind !== 'avalon_streaming'
      && kind !== 'clock'
      && kind !== 'reset');
  const byKind = new Map<ConnectionKind, QsysConnection[]>();
  for (const connection of candidates) {
    byKind.set(connection.kind, [...(byKind.get(connection.kind) ?? []), connection]);
  }

  const result: QsysConnection[][] = [];
  for (const group of byKind.values()) {
    const bySource = groupBy(group, sourceEndpointKey);
    const byTarget = groupBy(group, targetEndpointKey);
    const remaining = new Set(group);
    while (remaining.size > 0) {
      const first = remaining.values().next().value as QsysConnection;
      const component: QsysConnection[] = [];
      const pending = [first];
      remaining.delete(first);
      while (pending.length > 0) {
        const connection = pending.pop()!;
        component.push(connection);
        const neighbours = [
          ...(bySource.get(sourceEndpointKey(connection)) ?? []),
          ...(byTarget.get(targetEndpointKey(connection)) ?? []),
        ];
        for (const neighbour of neighbours) {
          if (!remaining.delete(neighbour)) continue;
          pending.push(neighbour);
        }
      }
      const sources = new Set(component.map(sourceEndpointKey));
      const targets = new Set(component.map(targetEndpointKey));
      if (component.length > 1 && (sources.size > 1 || targets.size > 1)) result.push(component);
    }
  }
  return result;
}

function createFabric(component: QsysConnection[], usedModuleIds: Set<string>): ConnectionFabric {
  const anchor = component[0]!;
  const sorted = [...component].sort(compareConnections);
  const kind = sorted[0]!.kind;
  const rawKind = sorted.find(({ rawKind: value }) => value && !value.startsWith('unknown'))?.rawKind
    ?? sorted[0]!.rawKind;
  // Keep the synthetic node stable while branches are added or removed. Tcl
  // normally appends new connections, so the first existing relationship is
  // a much better identity anchor than the full, changing component contents.
  const signature = `${kind}|${sourceEndpointKey(anchor)}>${targetEndpointKey(anchor)}`;
  const hierarchy = commonHierarchyParent(sorted.flatMap(({ source, target }) => [source, target]));
  const baseId = `${hierarchy ? `${hierarchy}/` : ''}__qsys_view_fabric_${kind}_${stableHash(signature)}`;
  let id = baseId;
  let suffix = 2;
  while (usedModuleIds.has(id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }
  usedModuleIds.add(id);

  const sourceGroups = groupBy(sorted, sourceEndpointKey);
  const targetGroups = groupBy(sorted, targetEndpointKey);
  const inputs = [...sourceGroups.values()]
    .sort((left, right) => naturalEndpointOrder(sourceEndpointKey(left[0]!), sourceEndpointKey(right[0]!)))
    .map((connections) => ({
      moduleId: connections[0]!.source,
      interfaceName: connections[0]!.sourcePort,
      edgeId: `${id}::input::${stableHash(sourceEndpointKey(connections[0]!))}`,
      connections,
    }));
  const outputs = [...targetGroups.values()]
    .sort((left, right) => naturalEndpointOrder(targetEndpointKey(left[0]!), targetEndpointKey(right[0]!)))
    .map((connections) => ({
      moduleId: connections[0]!.target,
      interfaceName: connections[0]!.targetPort,
      edgeId: `${id}::output::${stableHash(targetEndpointKey(connections[0]!))}`,
      connections,
    }));
  return { id, kind, rawKind, connections: sorted, inputs, outputs };
}

function fabricModule(fabric: ConnectionFabric): QsysModule {
  return {
    id: fabric.id,
    name: 'Interconnect',
    type: fabricType,
    disabled: false,
    parameters: {},
    ports: [],
  };
}

function fabricInputConnection(fabric: ConnectionFabric, endpoint: ConnectionFabricEndpoint): QsysConnection {
  return {
    id: endpoint.edgeId,
    source: endpoint.moduleId,
    sourcePort: endpoint.interfaceName,
    target: fabric.id,
    targetPort: fabricPortName('input', endpoint),
    kind: fabric.kind,
    rawKind: fabric.rawKind,
    parameters: {},
  };
}

function fabricOutputConnection(fabric: ConnectionFabric, endpoint: ConnectionFabricEndpoint): QsysConnection {
  return {
    id: endpoint.edgeId,
    source: fabric.id,
    sourcePort: fabricPortName('output', endpoint),
    target: endpoint.moduleId,
    targetPort: endpoint.interfaceName,
    kind: fabric.kind,
    rawKind: fabric.rawKind,
    parameters: {},
  };
}

function fabricPortName(side: 'input' | 'output', endpoint: ConnectionFabricEndpoint): string {
  return `${side}_${endpoint.moduleId}.${endpoint.interfaceName}`;
}

function groupBy(
  connections: readonly QsysConnection[],
  keyOf: (connection: QsysConnection) => string,
): Map<string, QsysConnection[]> {
  const groups = new Map<string, QsysConnection[]>();
  for (const connection of connections) {
    const key = keyOf(connection);
    groups.set(key, [...(groups.get(key) ?? []), connection]);
  }
  return groups;
}

function sourceEndpointKey(connection: QsysConnection): string {
  return `${connection.source}\0${connection.sourcePort}`;
}

function targetEndpointKey(connection: QsysConnection): string {
  return `${connection.target}\0${connection.targetPort}`;
}

function compareConnections(left: QsysConnection, right: QsysConnection): number {
  return naturalEndpointOrder(sourceEndpointKey(left), sourceEndpointKey(right))
    || naturalEndpointOrder(targetEndpointKey(left), targetEndpointKey(right))
    || naturalEndpointOrder(left.id, right.id);
}

function naturalEndpointOrder(left: string, right: string): number {
  return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });
}

function commonHierarchyParent(moduleIds: readonly string[]): string {
  if (moduleIds.length === 0) return '';
  const parents = moduleIds.map((id) => id.split('/').slice(0, -1));
  const first = parents[0]!;
  let length = first.length;
  for (const parent of parents.slice(1)) {
    length = Math.min(length, parent.length);
    for (let index = 0; index < length; index += 1) {
      if (parent[index] === first[index]) continue;
      length = index;
      break;
    }
  }
  return first.slice(0, length).join('/');
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
