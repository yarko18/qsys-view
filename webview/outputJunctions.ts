// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { ConnectionKind } from '../parser/graph';
import type { LayoutEdge, LayoutPoint } from '../layout/elk';

export interface OutputJunctionBranch {
  edgeId: string;
  paths: LayoutPoint[][];
  source: LayoutPoint;
}

export interface OutputJunction {
  key: string;
  kind: ConnectionKind;
  source: string;
  sourcePort: string;
  point: LayoutPoint;
  trunkPath: LayoutPoint[];
  branches: OutputJunctionBranch[];
}

const coordinateTolerance = 1;

interface ResolvedEdge {
  edge: LayoutEdge;
  path: LayoutPoint[];
  source: LayoutPoint;
}

/**
 * Draws one visible tree for every source endpoint. Avalon-MM fan-out is
 * represented by its dedicated bus, while Avalon-ST fan-out is invalid P2P
 * topology and is reported by connection diagnostics.
 */
export function createOutputJunctions(edges: readonly LayoutEdge[]): OutputJunction[] {
  const groups = new Map<string, LayoutEdge[]>();
  for (const edge of edges) {
    if (edge.kind === 'avalon_streaming' || edge.kind === 'avalon_memory_mapped') continue;
    const key = `${edge.source}\0${edge.sourcePort}`;
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }

  const junctions: OutputJunction[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const resolved = group.map(resolveEdge);
    if (resolved.some((item) => !item)) continue;
    const members = resolved as ResolvedEdge[];
    const source = members[0]!.source;
    if (members.some(({ source: candidate }) =>
      Math.abs(candidate.x - source.x) > coordinateTolerance
      || Math.abs(candidate.y - source.y) > coordinateTolerance)) {
      continue;
    }

    const point = commonPrefixEnd(members.map(({ path }) => path));
    const first = group.find((edge) => edge.kind !== 'other') ?? group[0]!;
    junctions.push({
      key,
      kind: first.kind,
      source: first.source,
      sourcePort: first.sourcePort,
      point,
      trunkPath: prefixToPoint(members[0]!.path, point),
      branches: members.map(({ edge, path }) => ({
        edgeId: edge.id,
        paths: [suffixFromPoint(path, point)],
        source,
      })),
    });
  }
  return junctions;
}

function resolveEdge(edge: LayoutEdge): ResolvedEdge | undefined {
  const nonempty = edge.paths.filter((path) => path.length >= 2);
  if (nonempty.length !== 1) return undefined;
  const path = nonempty[0]!;
  return { edge, path, source: path[0]! };
}

function commonPrefixEnd(paths: readonly LayoutPoint[][]): LayoutPoint {
  const positions = paths.map((path) => ({
    path,
    segment: 0,
    point: { ...path[0]! },
  }));
  let common = { ...positions[0]!.point };

  for (;;) {
    const directions = positions.map((position) => nextDirection(position));
    const direction = directions[0];
    if (!direction || directions.some((candidate) =>
      !candidate || candidate.x !== direction.x || candidate.y !== direction.y)) {
      return common;
    }
    const distance = Math.min(...positions.map(distanceToNextPoint));
    if (!Number.isFinite(distance) || distance <= coordinateTolerance) return common;
    common = {
      x: common.x + direction.x * distance,
      y: common.y + direction.y * distance,
    };
    for (const position of positions) {
      position.point = { ...common };
      const next = position.path[position.segment + 1];
      if (next && pointsEqual(position.point, next)) position.segment += 1;
    }
  }
}

function nextDirection(position: { path: LayoutPoint[]; segment: number; point: LayoutPoint }): LayoutPoint | undefined {
  const next = position.path[position.segment + 1];
  if (!next) return undefined;
  return {
    x: Math.sign(next.x - position.point.x),
    y: Math.sign(next.y - position.point.y),
  };
}

function distanceToNextPoint(position: { path: LayoutPoint[]; segment: number; point: LayoutPoint }): number {
  const next = position.path[position.segment + 1];
  return next ? Math.abs(next.x - position.point.x) + Math.abs(next.y - position.point.y) : Number.POSITIVE_INFINITY;
}

function prefixToPoint(path: readonly LayoutPoint[], point: LayoutPoint): LayoutPoint[] {
  for (let index = path.length - 2; index >= 0; index -= 1) {
    if (!pointOnSegment(point, path[index]!, path[index + 1]!)) continue;
    return appendDistinct(path.slice(0, index + 1), point);
  }
  return [...path];
}

function suffixFromPoint(path: readonly LayoutPoint[], point: LayoutPoint): LayoutPoint[] {
  for (let index = path.length - 2; index >= 0; index -= 1) {
    if (!pointOnSegment(point, path[index]!, path[index + 1]!)) continue;
    return appendDistinct([point], ...path.slice(index + 1));
  }
  return [point, path.at(-1)!];
}

function pointOnSegment(point: LayoutPoint, start: LayoutPoint, end: LayoutPoint): boolean {
  const minX = Math.min(start.x, end.x) - coordinateTolerance;
  const maxX = Math.max(start.x, end.x) + coordinateTolerance;
  const minY = Math.min(start.y, end.y) - coordinateTolerance;
  const maxY = Math.max(start.y, end.y) + coordinateTolerance;
  const cross = (point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x);
  return Math.abs(cross) <= coordinateTolerance
    && point.x >= minX && point.x <= maxX
    && point.y >= minY && point.y <= maxY;
}

function appendDistinct(first: LayoutPoint[], ...rest: LayoutPoint[]): LayoutPoint[] {
  const result = [...first];
  for (const point of rest) {
    if (!pointsEqual(result.at(-1), point)) result.push(point);
  }
  return result;
}

function pointsEqual(left: LayoutPoint | undefined, right: LayoutPoint): boolean {
  return Boolean(left
    && Math.abs(left.x - right.x) <= coordinateTolerance
    && Math.abs(left.y - right.y) <= coordinateTolerance);
}
