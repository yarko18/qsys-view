// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { LayoutEdge, LayoutPoint } from '../layout/elk';

export interface AvalonMmBusBranch {
  edgeId: string;
  paths: LayoutPoint[][];
}

export interface AvalonMmBus {
  key: string;
  source: string;
  sourcePort: string;
  sourcePath: LayoutPoint[];
  trunkPath: LayoutPoint[];
  branches: AvalonMmBusBranch[];
}

const endpointClearance = 36;

function edgeEndpoints(edge: LayoutEdge): { source: LayoutPoint; target: LayoutPoint } | undefined {
  const nonempty = edge.paths.filter((points) => points.length > 0);
  const source = nonempty[0]?.[0];
  const target = nonempty.at(-1)?.at(-1);
  return source && target ? { source, target } : undefined;
}

/**
 * Replaces the fan-out of a multi-slave Avalon-MM master with one thick trunk
 * and short, individually selectable branches. Backward or crowded routes
 * retain their original ELK geometry rather than crossing IP blocks.
 */
export function createAvalonMmBuses(edges: readonly LayoutEdge[]): AvalonMmBus[] {
  const groups = new Map<string, LayoutEdge[]>();
  for (const edge of edges) {
    if (edge.kind !== 'avalon_memory_mapped') continue;
    const key = `${edge.source}\0${edge.sourcePort}`;
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }

  const buses: AvalonMmBus[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const endpoints = group.map(edgeEndpoints);
    if (endpoints.some((value) => !value)) continue;
    const resolved = endpoints as Array<{ source: LayoutPoint; target: LayoutPoint }>;
    const source = resolved[0]!.source;
    if (resolved.some((value) => Math.abs(value.source.x - source.x) > 1 || Math.abs(value.source.y - source.y) > 1)) {
      continue;
    }
    const minimumTargetX = Math.min(...resolved.map((value) => value.target.x));
    const left = source.x + endpointClearance;
    const right = minimumTargetX - endpointClearance;
    if (left > right) continue;
    const busX = (left + right) / 2;
    const ys = [source.y, ...resolved.map((value) => value.target.y)];
    const first = group[0]!;
    buses.push({
      key,
      source: first.source,
      sourcePort: first.sourcePort,
      sourcePath: [source, { x: busX, y: source.y }],
      trunkPath: [
        { x: busX, y: Math.min(...ys) },
        { x: busX, y: Math.max(...ys) },
      ],
      branches: group.map((edge, index) => ({
        edgeId: edge.id,
        paths: [[
          { x: busX, y: resolved[index]!.target.y },
          resolved[index]!.target,
        ]],
      })),
    });
  }
  return buses;
}
