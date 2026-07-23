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
