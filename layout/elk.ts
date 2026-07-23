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

export async function layoutGraph(
  modules: QsysModule[],
  connections: QsysConnection[],
): Promise<LayoutResult> {
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '44',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.padding': '[top=36,left=36,bottom=36,right=36]',
    },
    children: modules.map((module) => ({
      id: module.id,
      width: Math.max(150, Math.min(280, 70 + module.name.length * 7)),
      height: 70,
    })),
    edges: connections.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };
  const result = await elk.layout(graph);
  const moduleMap = new Map(modules.map((module) => [module.id, module]));
  const connectionMap = new Map(connections.map((connection) => [connection.id, connection]));
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

/**
 * Builds a stable master layout. When Avalon-ST exists, only its topology is
 * allowed to position the streaming pipeline. Modules outside that pipeline
 * are laid out separately and placed below it, so other connection kinds can
 * never move the Avalon-ST nodes.
 */
export async function layoutAnchoredGraph(
  modules: QsysModule[],
  connections: QsysConnection[],
): Promise<LayoutResult> {
  const moduleIds = new Set(modules.map((module) => module.id));
  const validConnections = connections.filter((connection) =>
    moduleIds.has(connection.source) && moduleIds.has(connection.target),
  );
  const streamingConnections = validConnections.filter((connection) => connection.kind === 'avalon_streaming');
  if (streamingConnections.length === 0) return layoutGraph(modules, validConnections);

  const streamingIds = new Set(streamingConnections.flatMap((connection) => [connection.source, connection.target]));
  const streamingModules = modules.filter((module) => streamingIds.has(module.id));
  const otherModules = modules.filter((module) => !streamingIds.has(module.id));
  const streamingLayout = await layoutGraph(streamingModules, streamingConnections);
  if (otherModules.length === 0) return streamingLayout;

  const otherIds = new Set(otherModules.map((module) => module.id));
  const otherConnections = validConnections.filter((connection) =>
    otherIds.has(connection.source) && otherIds.has(connection.target),
  );
  const otherLayout = await layoutGraph(otherModules, otherConnections);
  const gap = 80;
  const translatedOther = translateLayout(otherLayout, 0, streamingLayout.height + gap);

  return {
    width: Math.max(streamingLayout.width, translatedOther.width),
    height: translatedOther.height,
    nodes: [...streamingLayout.nodes, ...translatedOther.nodes],
    edges: [...streamingLayout.edges, ...translatedOther.edges],
  };
}

/** Keeps master node coordinates and selects/routs only the currently visible graph. */
export function projectVisibleLayout(
  master: LayoutResult,
  modules: QsysModule[],
  connections: QsysConnection[],
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
    if (existing) return [{ ...connection, paths: existing.paths }];

    const pair = `${connection.source}\u0000${connection.target}`;
    const parallelIndex = parallelCounts.get(pair) ?? 0;
    parallelCounts.set(pair, parallelIndex + 1);
    return [{ ...connection, paths: [routeOverlayEdge(source, target, parallelIndex)] }];
  });

  const maxNodeX = Math.max(0, ...nodes.map((node) => node.x + node.width));
  const maxNodeY = Math.max(0, ...nodes.map((node) => node.y + node.height));
  const edgePoints = edges.flatMap((edge) => edge.paths.flat());
  const maxEdgeX = Math.max(0, ...edgePoints.map((point) => point.x));
  const maxEdgeY = Math.max(0, ...edgePoints.map((point) => point.y));
  const padding = 36;
  return {
    width: Math.max(1, maxNodeX, maxEdgeX) + padding,
    height: Math.max(1, maxNodeY, maxEdgeY) + padding,
    nodes,
    edges,
  };
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

function routeOverlayEdge(source: LayoutNode, target: LayoutNode, parallelIndex: number): LayoutPoint[] {
  const offset = ((parallelIndex % 5) - 2) * 7;
  const sourceCenterX = source.x + source.width / 2;
  const sourceCenterY = source.y + source.height / 2;
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;

  if (Math.abs(targetCenterX - sourceCenterX) >= Math.abs(targetCenterY - sourceCenterY)) {
    const goesRight = targetCenterX >= sourceCenterX;
    const start = { x: goesRight ? source.x + source.width : source.x, y: sourceCenterY + offset };
    const end = { x: goesRight ? target.x : target.x + target.width, y: targetCenterY + offset };
    const middleX = (start.x + end.x) / 2 + offset;
    return [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end];
  }

  const goesDown = targetCenterY >= sourceCenterY;
  const start = { x: sourceCenterX + offset, y: goesDown ? source.y + source.height : source.y };
  const end = { x: targetCenterX + offset, y: goesDown ? target.y : target.y + target.height };
  const middleY = (start.y + end.y) / 2 + offset;
  return [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end];
}
