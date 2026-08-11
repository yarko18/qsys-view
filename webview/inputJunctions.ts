// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { ConnectionKind } from '../parser/graph';
import type { LayoutEdge, LayoutPoint } from '../layout/elk';

export interface InputJunctionBranch {
  edgeId: string;
  paths: LayoutPoint[][];
  target: LayoutPoint;
}

export interface InputJunction {
  key: string;
  kind: ConnectionKind;
  target: string;
  targetPort: string;
  point: LayoutPoint;
  trunkPath: LayoutPoint[];
  branches: InputJunctionBranch[];
}

const coordinateTolerance = 1;

interface ResolvedEdge {
  edge: LayoutEdge;
  path: LayoutPoint[];
  target: LayoutPoint;
}

/**
 * Merges two or more connections entering the same interface into a visible
 * junction. Every source keeps an individually selectable branch, followed by
 * one shared, arrowed segment into the input.
 */
export function createInputJunctions(edges: readonly LayoutEdge[]): InputJunction[] {
  const groups = new Map<string, LayoutEdge[]>();
  for (const edge of edges) {
    // The endpoint defines the electrical/logical input. Do not make
    // junction detection depend on interface classification: before Quartus
    // analysis the same connection may still be `other` (unknown).
    const key = `${edge.target}\0${edge.targetPort}`;
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }

  const junctions: InputJunction[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const resolved = group.map(resolveEdge);
    if (resolved.some((item) => !item)) continue;
    const members = resolved as ResolvedEdge[];
    const target = members[0]!.target;
    if (members.some(({ target: candidate }) =>
      Math.abs(candidate.x - target.x) > coordinateTolerance
      || Math.abs(candidate.y - target.y) > coordinateTolerance)) {
      continue;
    }

    // ELK often gives connections to the same port a shared suffix. Put the
    // dot where that suffix actually begins; otherwise the lines appear to
    // merge well before a decorative dot placed close to the target block.
    const point = commonSuffixStart(members.map(({ path }) => path));
    const trunkPath = suffixFromPoint(members[0]!.path, point);
    const first = group.find((edge) => edge.kind !== 'other') ?? group[0]!;
    junctions.push({
      key,
      kind: first.kind,
      target: first.target,
      targetPort: first.targetPort,
      point,
      trunkPath,
      branches: members.map(({ edge, path }) => ({
        edgeId: edge.id,
        paths: [prefixToPoint(path, point)],
        target,
      })),
    });
  }
  return junctions;
}

function resolveEdge(edge: LayoutEdge): ResolvedEdge | undefined {
  const nonempty = edge.paths.filter((path) => path.length >= 2);
  if (nonempty.length !== 1) return undefined;
  const path = nonempty[0]!;
  return {
    edge,
    path,
    target: path.at(-1)!,
  };
}

function commonSuffixStart(paths: readonly LayoutPoint[][]): LayoutPoint {
  const reversed = paths.map((path) => [...path].reverse());
  const positions = reversed.map((path) => ({
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
