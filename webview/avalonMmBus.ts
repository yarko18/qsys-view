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
const domainLaneSpacing = 18;

interface BusCandidate {
  key: string;
  group: LayoutEdge[];
  resolved: Array<{ source: LayoutPoint; target: LayoutPoint }>;
  source: LayoutPoint;
  left: number;
  right: number;
  preferredX: number;
  minimumY: number;
  maximumY: number;
}

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

  const candidates: BusCandidate[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const endpoints = group.map(edgeEndpoints);
    if (endpoints.some((value) => !value)) continue;
    const allResolved = endpoints as Array<{ source: LayoutPoint; target: LayoutPoint }>;
    const source = allResolved[0]!.source;
    if (allResolved.some((value) => Math.abs(value.source.x - source.x) > 1 || Math.abs(value.source.y - source.y) > 1)) {
      continue;
    }
    const forward = group.flatMap((edge, index) => {
      const endpoint = allResolved[index]!;
      return endpoint.target.x - source.x >= endpointClearance * 2 ? [{ edge, endpoint }] : [];
    });
    if (forward.length < 2) continue;
    const forwardGroup = forward.map(({ edge }) => edge);
    const resolved = forward.map(({ endpoint }) => endpoint);
    const minimumTargetX = Math.min(...resolved.map((value) => value.target.x));
    const left = source.x + endpointClearance;
    const right = minimumTargetX - endpointClearance;
    if (left > right) continue;
    const ys = [source.y, ...resolved.map((value) => value.target.y)];
    candidates.push({
      key,
      group: forwardGroup,
      resolved,
      source,
      left,
      right,
      preferredX: (left + right) / 2,
      minimumY: Math.min(...ys),
      maximumY: Math.max(...ys),
    });
  }

  // Every source endpoint owns an independent tree. Give overlapping trees
  // separate vertical lanes instead of letting their trunks hide each other.
  const assigned: Array<BusCandidate & { busX: number }> = [];
  for (const candidate of candidates.sort(compareCandidates)) {
    const busX = chooseLane(candidate, assigned);
    assigned.push({ ...candidate, busX });
  }

  return assigned.map(({ key, group, resolved, source, busX, minimumY, maximumY }) => {
    const first = group[0]!;
    return {
      key,
      source: first.source,
      sourcePort: first.sourcePort,
      sourcePath: [source, { x: busX, y: source.y }],
      trunkPath: [
        { x: busX, y: minimumY },
        { x: busX, y: maximumY },
      ],
      branches: group.map((edge, index) => ({
        edgeId: edge.id,
        paths: [[
          { x: busX, y: resolved[index]!.target.y },
          resolved[index]!.target,
        ]],
      })),
    };
  });
}

function compareCandidates(left: BusCandidate, right: BusCandidate): number {
  return left.source.x - right.source.x
    || left.source.y - right.source.y
    || left.key.localeCompare(right.key, 'en', { numeric: true, sensitivity: 'base' });
}

function chooseLane(candidate: BusCandidate, assigned: ReadonlyArray<BusCandidate & { busX: number }>): number {
  const conflicts = assigned.filter((other) => verticalRangesOverlap(candidate, other));
  const positions = [candidate.preferredX];
  const steps = Math.ceil((candidate.right - candidate.left) / domainLaneSpacing);
  for (let step = 1; step <= steps; step += 1) {
    positions.push(
      candidate.preferredX - step * domainLaneSpacing,
      candidate.preferredX + step * domainLaneSpacing,
    );
  }
  positions.push(candidate.left, candidate.right);
  const available = positions.find((x) =>
    x >= candidate.left && x <= candidate.right
    && conflicts.every((other) => Math.abs(x - other.busX) >= domainLaneSpacing));
  if (available !== undefined) return available;

  // A very narrow layer gap can make the requested spacing impossible. Use
  // the centre of the widest remaining interval so domains stay distinct.
  const occupied = conflicts
    .map(({ busX }) => busX)
    .filter((x) => x >= candidate.left && x <= candidate.right)
    .sort((left, right) => left - right);
  const fallbackPositions = [candidate.left, candidate.right];
  const boundaries = [candidate.left, ...occupied, candidate.right];
  for (let index = 1; index < boundaries.length; index += 1) {
    fallbackPositions.push((boundaries[index - 1]! + boundaries[index]!) / 2);
  }
  return fallbackPositions.sort((left, right) =>
    minimumLaneDistance(right, conflicts) - minimumLaneDistance(left, conflicts)
      || Math.abs(left - candidate.preferredX) - Math.abs(right - candidate.preferredX))[0]!;
}

function verticalRangesOverlap(left: BusCandidate, right: BusCandidate): boolean {
  return left.minimumY <= right.maximumY && right.minimumY <= left.maximumY;
}

function minimumLaneDistance(x: number, assigned: ReadonlyArray<{ busX: number }>): number {
  return assigned.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...assigned.map((other) => Math.abs(x - other.busX)));
}
