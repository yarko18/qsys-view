// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import type { QsysConnection, QsysModule } from '../parser/graph';

const elk = new ELK();

export interface LayoutResult {
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

export interface LayoutNode extends QsysModule {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutPoint { x: number; y: number }

export interface LayoutEdge extends QsysConnection {
  paths: LayoutPoint[][];
}

export interface LayoutExternalPort {
  moduleId: string;
  interfaceName: string;
  direction: 'input' | 'output';
  label?: string;
}

const minimumNodeWidth = 150;
const minimumNodeHeight = 70;
const minimumInterfaceSpacing = 18;
const minimumExportStubLength = 54;
const exportLabelCharacterWidth = 5.8;
const exportLabelPadding = 20;
const exportLabelHeight = 12;

interface FrozenNodeGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StableLayoutCache {
  nodes: Map<string, FrozenNodeGeometry>;
  routes: Map<string, LayoutPoint[][]>;
}

export interface StableLayoutResult {
  layout: LayoutResult;
  cache: StableLayoutCache;
}

interface NodeOffset { x: number; y: number }

interface LayoutPortSlot {
  key: string;
  interfaceName: string;
  external: boolean;
}

export function pathMidpoint(paths: LayoutPoint[][]): LayoutPoint | undefined {
  const segments = paths.flatMap((points) => points.slice(1).map((end, index) => ({
    start: points[index]!,
    end,
    length: Math.hypot(end.x - points[index]!.x, end.y - points[index]!.y),
  })));
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (total === 0) return paths[0]?.[0];
  let remaining = total / 2;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length === 0 ? 0 : remaining / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }
    remaining -= segment.length;
  }
  return segments.at(-1)?.end;
}

/**
 * Preserves the flat ELK topology when subsystem decorations are added. Only
 * real overlaps between visible nodes are separated; hidden descendants and
 * empty space inside a hierarchy frame must not move the visible pipeline.
 */
export function separateHierarchyGroups(
  layout: LayoutResult,
  expandedInstanceIds: readonly string[],
  externalPorts: readonly LayoutExternalPort[] = [],
  visibleNodeIds?: ReadonlySet<string>,
): LayoutResult {
  const roots = expandedInstanceIds.filter((instanceId) =>
    !expandedInstanceIds.some((candidate) => candidate !== instanceId && instanceId.startsWith(`${candidate}/`)),
  );
  if (roots.length === 0) return layout;

  let nodes = layout.nodes.map((node) => ({ ...node }));
  const offsets = new Map(nodes.map((node) => [node.id, { x: 0, y: 0 } satisfies NodeOffset]));
  for (const instanceId of roots) {
    const descendants = nodes.filter((node) => node.id.startsWith(`${instanceId}/`)
      && (!visibleNodeIds || visibleNodeIds.has(node.id)));
    if (descendants.length === 0) continue;
    const descendantIds = new Set(descendants.map((node) => node.id));
    const outsiders = nodes.filter((node) => !descendantIds.has(node.id)
      && (!visibleNodeIds || visibleNodeIds.has(node.id)));
    const overlappingIds = new Set(outsiders
      .filter((node) => descendants.some((descendant) => rectanglesOverlap(descendant, node)))
      .map((node) => node.id));
    if (overlappingIds.size === 0) continue;

    // Another expanded root is one visual unit too; do not split it when one
    // of its descendants happens to overlap this frame.
    for (const root of roots) {
      if (root === instanceId) continue;
      if (nodes.some((node) => overlappingIds.has(node.id) && node.id.startsWith(`${root}/`))) {
        for (const node of nodes) {
          if (node.id.startsWith(`${root}/`) && (!visibleNodeIds || visibleNodeIds.has(node.id))) {
            overlappingIds.add(node.id);
          }
        }
      }
    }
    const overlapping = nodes.filter((node) => overlappingIds.has(node.id));
    const overlapBounds = nodeBounds(overlapping);
    const bounds = nodeBounds(descendants);
    let dy = bounds.y + bounds.height + 60 - overlapBounds.y;
    const stationary = nodes.filter((node) => !overlappingIds.has(node.id)
      && (!visibleNodeIds || visibleNodeIds.has(node.id)));
    for (;;) {
      const translated = overlapping.map((node) => ({ ...node, y: node.y + dy }));
      const collisions = stationary.filter((node) => translated.some((candidate) => rectanglesOverlap(candidate, node)));
      if (collisions.length === 0) break;
      dy = Math.max(...collisions.map((node) => node.y + node.height)) + 60 - overlapBounds.y;
    }
    nodes = nodes.map((node) => {
      if (!overlappingIds.has(node.id)) return node;
      const current = offsets.get(node.id)!;
      offsets.set(node.id, { x: current.x, y: current.y + dy });
      return { ...node, y: node.y + dy };
    });
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const parallelCounts = new Map<string, number>();
  const edges = layout.edges.flatMap((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) return [];
    const sourceOffset = offsets.get(edge.source) ?? { x: 0, y: 0 };
    const targetOffset = offsets.get(edge.target) ?? { x: 0, y: 0 };
    if (sourceOffset.x === targetOffset.x && sourceOffset.y === targetOffset.y) {
      return [{
        ...edge,
        paths: edge.paths.map((path) => path.map((point) => ({
          x: point.x + sourceOffset.x,
          y: point.y + sourceOffset.y,
        }))),
      }];
    }
    const pair = `${edge.source}\u0000${edge.target}`;
    const parallelIndex = parallelCounts.get(pair) ?? 0;
    parallelCounts.set(pair, parallelIndex + 1);
    return [{
      ...edge,
      paths: [routeOverlayEdge(
        source,
        target,
        parallelIndex,
        connectionPortAnchorY(source, 'output', edge, layout.edges, externalPorts),
        connectionPortAnchorY(target, 'input', edge, layout.edges, externalPorts),
      )],
    }];
  });
  return layoutBounds(nodes, edges);
}

export async function layoutGraph(
  modules: QsysModule[],
  connections: QsysConnection[],
  externalPorts: readonly LayoutExternalPort[] = [],
): Promise<LayoutResult> {
  const moduleIds = new Set(modules.map((module) => module.id));
  const validConnections = connections.filter((connection) =>
    moduleIds.has(connection.source) && moduleIds.has(connection.target),
  );
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '44',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.edgeStraightening': 'IMPROVE_STRAIGHTNESS',
      'elk.layered.nodePlacement.favorStraightEdges': 'true',
      'elk.layered.mergeEdges': 'false',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '16',
      'elk.padding': '[top=36,left=90,bottom=36,right=90]',
    },
    children: modules.map((module) => {
      const inputs = inputPortSlots(module.id, validConnections, externalPorts);
      const outputs = interfaceNames(module.id, 'output', validConnections, externalPorts);
      const dimensions = moduleDimensions(module, validConnections, externalPorts);
      return {
        id: module.id,
        width: dimensions.width,
        height: dimensions.height,
        layoutOptions: {
          'elk.portConstraints': 'FIXED_ORDER',
          'elk.portAlignment.default': 'DISTRIBUTED',
          'elk.portLabels.placement': 'OUTSIDE',
        },
        ports: [
          ...inputs.map((slot, index) => ({
            id: elkPortId(module.id, 'input', slot.key),
            width: 0,
            height: 0,
            labels: layoutPortLabel(module.id, 'input', slot.interfaceName, externalPorts, slot.key),
            // ELK numbers west-side ports clockwise, hence the reversed index.
            layoutOptions: {
              'elk.port.side': 'WEST',
              'elk.port.index': String(inputs.length - index - 1),
            },
          })),
          ...outputs.map((interfaceName, index) => ({
            id: elkPortId(module.id, 'output', interfaceName),
            width: 0,
            height: 0,
            labels: layoutPortLabel(module.id, 'output', interfaceName, externalPorts),
            layoutOptions: {
              'elk.port.side': 'EAST',
              'elk.port.index': String(index),
            },
          })),
        ],
      };
    }),
    edges: validConnections.map((edge) => ({
      id: edge.id,
      sources: [elkPortId(edge.source, 'output', edge.sourcePort)],
      targets: [elkPortId(edge.target, 'input', inputPortSlotKey(edge))],
    })),
  };
  const result = await elk.layout(graph);
  const moduleMap = new Map(modules.map((module) => [module.id, module]));
  const connectionMap = new Map(validConnections.map((connection) => [connection.id, connection]));
  const nodes = (result.children ?? []).flatMap((node) => {
    const module = moduleMap.get(node.id);
    if (!module) return [];
    return [{
      ...module,
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: node.width ?? 150,
      height: node.height ?? 70,
    }];
  });
  const edges = ((result.edges ?? []) as ElkExtendedEdge[]).flatMap((edge) => {
    const connection = connectionMap.get(edge.id);
    if (!connection) return [];
    const paths = (edge.sections ?? []).map((section) => [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ]);
    return [{ ...connection, paths }];
  });
  return {
    width: result.width ?? 1,
    height: result.height ?? 1,
    nodes,
    edges,
  };
}

function elkPortId(moduleId: string, direction: 'input' | 'output', interfaceName: string): string {
  return `${moduleId}::${direction}::${interfaceName}`;
}

function naturalInterfaceOrder(left: string, right: string): number {
  return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });
}

/**
 * Builds a stable master layout. When Avalon-ST exists, only its topology is
 * allowed to position the streaming pipeline. Modules outside that pipeline
 * are laid out separately and placed below it, so other connection kinds can
 * never move the Avalon-ST nodes.
 */
export async function layoutAnchoredGraph(
  modules: QsysModule[],
  connections: QsysConnection[],
  externalPorts: readonly LayoutExternalPort[] = [],
): Promise<LayoutResult> {
  const moduleIds = new Set(modules.map((module) => module.id));
  const validConnections = connections.filter((connection) =>
    moduleIds.has(connection.source) && moduleIds.has(connection.target),
  );
  const streamingConnections = validConnections.filter((connection) => connection.kind === 'avalon_streaming');
  if (streamingConnections.length === 0) return layoutGraph(modules, validConnections, externalPorts);

  const streamingIds = new Set(streamingConnections.flatMap((connection) => [connection.source, connection.target]));
  const streamingModules = modules.filter((module) => streamingIds.has(module.id));
  const otherModules = modules.filter((module) => !streamingIds.has(module.id));
  const streamingLayout = await layoutGraph(streamingModules, streamingConnections, externalPorts);
  if (otherModules.length === 0) return streamingLayout;

  const otherIds = new Set(otherModules.map((module) => module.id));
  const otherConnections = validConnections.filter((connection) =>
    otherIds.has(connection.source) && otherIds.has(connection.target),
  );
  const otherLayout = await layoutGraph(otherModules, otherConnections, externalPorts);
  const gap = 80;
  const translatedOther = translateLayout(otherLayout, 0, streamingLayout.height + gap);

  return {
    width: Math.max(streamingLayout.width, translatedOther.width),
    height: translatedOther.height,
    nodes: [...streamingLayout.nodes, ...translatedOther.nodes],
    edges: [...streamingLayout.edges, ...translatedOther.edges],
  };
}

/**
 * Keeps every previously placed node fixed while graph contents change. New
 * nodes are appended below the frozen area; a caller can discard the cache to
 * explicitly request a complete relayout.
 */
export async function layoutStableGraph(
  modules: QsysModule[],
  connections: QsysConnection[],
  previous: StableLayoutCache | undefined,
  initialLayout: (
    modules: QsysModule[],
    connections: QsysConnection[],
    externalPorts: readonly LayoutExternalPort[],
  ) => Promise<LayoutResult> = layoutGraph,
  externalPorts: readonly LayoutExternalPort[] = [],
): Promise<StableLayoutResult> {
  if (!previous) {
    const layout = await initialLayout(modules, connections, externalPorts);
    return {
      layout,
      cache: {
        nodes: new Map(layout.nodes.map((node) => [node.id, geometry(node)])),
        routes: new Map(layout.edges.map((edge) => [routeKey(edge), edge.paths])),
      },
    };
  }

  const nodes = new Map(previous.nodes);
  const routes = new Map(previous.routes);
  const resizedNodeIds = new Set<string>();
  for (const module of modules) {
    const frozen = nodes.get(module.id);
    if (!frozen) continue;
    const dimensions = moduleDimensions(module, connections, externalPorts);
    const width = Math.max(frozen.width, dimensions.width);
    const height = Math.max(frozen.height, dimensions.height);
    if (width === frozen.width && height === frozen.height) continue;
    nodes.set(module.id, { ...frozen, width, height });
    resizedNodeIds.add(module.id);
  }
  const newModules = modules.filter((module) => !nodes.has(module.id));
  if (newModules.length > 0) {
    const newIds = new Set(newModules.map((module) => module.id));
    const newConnections = connections.filter((connection) =>
      newIds.has(connection.source) && newIds.has(connection.target),
    );
    const appended = await layoutGraph(newModules, newConnections, externalPorts);
    const bottom = Math.max(0, ...[...nodes.values()].map((node) => node.y + node.height));
    const offsetY = nodes.size > 0 ? bottom + 80 : 0;
    for (const node of appended.nodes) {
      nodes.set(node.id, {
        x: node.x,
        y: node.y + offsetY,
        width: node.width,
        height: node.height,
      });
    }
  }

  const frozenNodes = modules.flatMap((module) => {
    const frozen = nodes.get(module.id);
    return frozen ? [{ ...module, ...frozen }] : [];
  });
  const reusableEdges = connections.flatMap((connection) => {
    if (resizedNodeIds.has(connection.source) || resizedNodeIds.has(connection.target)) return [];
    const paths = routes.get(routeKey(connection));
    return paths ? [{ ...connection, paths }] : [];
  });
  const projected = projectVisibleLayout(
    { width: 1, height: 1, nodes: frozenNodes, edges: reusableEdges },
    modules,
    connections,
    externalPorts,
  );
  for (const edge of projected.edges) routes.set(routeKey(edge), edge.paths);
  return { layout: projected, cache: { nodes, routes } };
}

/** Keeps master node coordinates and selects/routs only the currently visible graph. */
export function projectVisibleLayout(
  master: LayoutResult,
  modules: QsysModule[],
  connections: QsysConnection[],
  externalPorts: readonly LayoutExternalPort[] = [],
): LayoutResult {
  const visibleIds = new Set(modules.map((module) => module.id));
  const nodes = master.nodes.filter((node) => visibleIds.has(node.id));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const masterEdgeMap = new Map(master.edges.map((edge) => [edge.id, edge]));
  const parallelCounts = new Map<string, number>();
  const edges = connections.flatMap((connection) => {
    const source = nodeMap.get(connection.source);
    const target = nodeMap.get(connection.target);
    if (!source || !target) return [];
    const existing = masterEdgeMap.get(connection.id);
    if (existing && existing.source === connection.source && existing.target === connection.target) {
      return [{ ...connection, paths: existing.paths }];
    }

    const pair = `${connection.source}\u0000${connection.target}`;
    const parallelIndex = parallelCounts.get(pair) ?? 0;
    parallelCounts.set(pair, parallelIndex + 1);
    return [{
      ...connection,
      paths: [routeOverlayEdge(
        source,
        target,
        parallelIndex,
        connectionPortAnchorY(source, 'output', connection, connections, externalPorts),
        connectionPortAnchorY(target, 'input', connection, connections, externalPorts),
      )],
    }];
  });

  const maxNodeX = Math.max(0, ...nodes.map((node) => node.x + node.width));
  const maxNodeY = Math.max(0, ...nodes.map((node) => node.y + node.height));
  const edgePoints = edges.flatMap((edge) => edge.paths.flat());
  const maxEdgeX = Math.max(0, ...edgePoints.map((point) => point.x));
  const maxEdgeY = Math.max(0, ...edgePoints.map((point) => point.y));
  const rightExport = Math.max(0, ...externalPorts
    .filter((port) => port.direction === 'output' && visibleIds.has(port.moduleId))
    .map((port) => exportedInterfaceStubLength(port.label ?? port.interfaceName)));
  return {
    width: Math.max(1, maxNodeX, maxEdgeX) + Math.max(90, rightExport + 20),
    height: Math.max(1, maxNodeY, maxEdgeY) + 36,
    nodes,
    edges,
  };
}

function geometry(node: LayoutNode): FrozenNodeGeometry {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

function routeKey(connection: QsysConnection): string {
  return `${connection.id}\u0000${connection.source}\u0000${connection.target}`;
}

function translateLayout(layout: LayoutResult, dx: number, dy: number): LayoutResult {
  return {
    width: layout.width + dx,
    height: layout.height + dy,
    nodes: layout.nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy })),
    edges: layout.edges.map((edge) => ({
      ...edge,
      paths: edge.paths.map((path) => path.map((point) => ({ x: point.x + dx, y: point.y + dy }))),
    })),
  };
}

function routeOverlayEdge(
  source: LayoutNode,
  target: LayoutNode,
  parallelIndex: number,
  sourceY = source.y + source.height / 2,
  targetY = target.y + target.height / 2,
): LayoutPoint[] {
  const offset = ((parallelIndex % 5) - 2) * 7;
  const start = { x: source.x + source.width, y: sourceY };
  const end = { x: target.x, y: targetY };

  if (start.x < end.x) {
    const middleX = (start.x + end.x) / 2 + offset;
    return [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end];
  }

  // A feedback edge must still leave the source on the right and enter the
  // target on the left. Route it around both blocks instead of taking the
  // geometrically shorter path through their opposite sides.
  const spacing = 50 + parallelIndex * 14;
  const right = Math.max(source.x + source.width, target.x + target.width) + spacing;
  const left = Math.min(source.x, target.x) - spacing;
  const bottom = Math.max(source.y + source.height, target.y + target.height) + spacing;
  return [
    start,
    { x: right, y: start.y },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: end.y },
    end,
  ];
}

/** Matches ELK's distributed fixed-order placement for a named interface. */
export function portAnchorY(
  node: LayoutNode,
  direction: 'input' | 'output',
  interfaceName: string,
  connections: readonly QsysConnection[],
  externalPorts: readonly LayoutExternalPort[] = [],
): number {
  if (direction === 'input') {
    const slots = inputPortSlots(node.id, connections, externalPorts);
    const externalSlot = slots.find((slot) => slot.external && slot.interfaceName === interfaceName);
    const slot = externalSlot ?? slots.find((candidate) => candidate.interfaceName === interfaceName);
    return distributedPortY(node, slots, slot?.key);
  }
  const connected = connections.flatMap((connection) => {
    if (direction === 'output' && connection.source === node.id) return [connection.sourcePort];
    return [];
  });
  const external = externalPorts
    .filter((port) => port.moduleId === node.id && port.direction === direction)
    .map((port) => port.interfaceName);
  const names = [...new Set([...connected, ...external])].sort(naturalInterfaceOrder);
  return distributedPortY(
    node,
    names.map((name) => ({ key: name })),
    interfaceName,
  );
}

/** Uses one target-side slot per source domain, even when domains share a slave. */
export function connectionPortAnchorY(
  node: LayoutNode,
  direction: 'input' | 'output',
  connection: QsysConnection,
  connections: readonly QsysConnection[],
  externalPorts: readonly LayoutExternalPort[] = [],
): number {
  if (direction === 'output') {
    return portAnchorY(node, direction, connection.sourcePort, connections, externalPorts);
  }
  const slots = inputPortSlots(node.id, connections, externalPorts);
  return distributedPortY(node, slots, inputPortSlotKey(connection));
}

/** Estimates the horizontal room needed by a rendered exported-interface label. */
export function exportedInterfaceLabelWidth(label: string): number {
  return Math.max(24, Math.ceil(label.length * exportLabelCharacterWidth));
}

/** Keeps an exported-interface label between its terminal and the IP border. */
export function exportedInterfaceStubLength(label: string): number {
  return Math.max(minimumExportStubLength, exportedInterfaceLabelWidth(label) + exportLabelPadding);
}

function moduleDimensions(
  module: QsysModule,
  connections: readonly QsysConnection[],
  externalPorts: readonly LayoutExternalPort[],
): { width: number; height: number } {
  const inputs = inputPortSlots(module.id, connections, externalPorts);
  const outputs = interfaceNames(module.id, 'output', connections, externalPorts);
  return {
    width: Math.max(minimumNodeWidth, Math.min(280, 70 + module.name.length * 7)),
    height: Math.max(minimumNodeHeight, (Math.max(inputs.length, outputs.length) + 1) * minimumInterfaceSpacing),
  };
}

function inputPortSlotKey(connection: QsysConnection): string {
  return `${connection.targetPort}::source::${connection.source}::${connection.sourcePort}`;
}

function inputPortSlots(
  moduleId: string,
  connections: readonly QsysConnection[],
  externalPorts: readonly LayoutExternalPort[],
): LayoutPortSlot[] {
  const slots = new Map<string, LayoutPortSlot>();
  for (const connection of connections) {
    if (connection.target !== moduleId) continue;
    const key = inputPortSlotKey(connection);
    slots.set(key, { key, interfaceName: connection.targetPort, external: false });
  }
  for (const port of externalPorts) {
    if (port.moduleId !== moduleId || port.direction !== 'input') continue;
    const key = `${port.interfaceName}::external`;
    slots.set(key, { key, interfaceName: port.interfaceName, external: true });
  }
  return [...slots.values()].sort((left, right) =>
    naturalInterfaceOrder(left.interfaceName, right.interfaceName)
      || naturalInterfaceOrder(left.key, right.key));
}

function distributedPortY<T extends { key: string }>(
  node: LayoutNode,
  slots: readonly T[],
  key: string | undefined,
): number {
  const index = key === undefined ? -1 : slots.findIndex((slot) => slot.key === key);
  return index < 0
    ? node.y + node.height / 2
    : node.y + node.height * (index + 1) / (slots.length + 1);
}

function interfaceNames(
  moduleId: string,
  direction: 'input' | 'output',
  connections: readonly QsysConnection[],
  externalPorts: readonly LayoutExternalPort[],
): string[] {
  const connected = connections.flatMap((connection) => {
    if (direction === 'input' && connection.target === moduleId) return [connection.targetPort];
    if (direction === 'output' && connection.source === moduleId) return [connection.sourcePort];
    return [];
  });
  const external = externalPorts
    .filter((port) => port.moduleId === moduleId && port.direction === direction)
    .map((port) => port.interfaceName);
  return [...new Set([...connected, ...external])].sort(naturalInterfaceOrder);
}

function layoutPortLabel(
  moduleId: string,
  direction: 'input' | 'output',
  interfaceName: string,
  externalPorts: readonly LayoutExternalPort[],
  portKey = interfaceName,
): Array<{ id: string; text: string; width: number; height: number }> | undefined {
  const labels = [interfaceName, ...externalPorts
    .filter((port) => port.moduleId === moduleId
      && port.direction === direction
      && port.interfaceName === interfaceName)
    .map((port) => port.label ?? port.interfaceName)]
    .sort((left, right) => exportedInterfaceLabelWidth(right) - exportedInterfaceLabelWidth(left));
  const label = labels[0];
  return label ? [{
    id: `${elkPortId(moduleId, direction, portKey)}::external-label`,
    text: label,
    width: exportedInterfaceLabelWidth(label),
    height: exportLabelHeight,
  }] : undefined;
}

function nodeBounds(nodes: readonly LayoutNode[]): { x: number; y: number; width: number; height: number } {
  const x = Math.min(...nodes.map((node) => node.x));
  const y = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));
  return { x, y, width: right - x, height: bottom - y };
}

function rectanglesOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function layoutBounds(nodes: LayoutNode[], edges: LayoutEdge[]): LayoutResult {
  const maxNodeX = Math.max(0, ...nodes.map((node) => node.x + node.width));
  const maxNodeY = Math.max(0, ...nodes.map((node) => node.y + node.height));
  const points = edges.flatMap((edge) => edge.paths.flat());
  return {
    width: Math.max(1, maxNodeX, ...points.map((point) => point.x)) + 36,
    height: Math.max(1, maxNodeY, ...points.map((point) => point.y)) + 36,
    nodes,
    edges,
  };
}
