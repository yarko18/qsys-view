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

const preferredTrunkLength = 36;
const coordinateTolerance = 1;

interface ResolvedEdge {
  edge: LayoutEdge;
  path: LayoutPoint[];
  target: LayoutPoint;
  previous: LayoutPoint;
}

/**
 * Merges two or more connections entering the same interface into a visible
 * junction. Every source keeps an individually selectable branch, followed by
 * one shared, arrowed segment into the input.
 */
export function createInputJunctions(edges: readonly LayoutEdge[]): InputJunction[] {
  const groups = new Map<string, LayoutEdge[]>();
  for (const edge of edges) {
    const key = `${edge.kind}\0${edge.target}\0${edge.targetPort}`;
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
    if (members.some(({ target: candidate, previous }) =>
      Math.abs(candidate.x - target.x) > coordinateTolerance
      || Math.abs(candidate.y - target.y) > coordinateTolerance
      || Math.abs(previous.y - target.y) > coordinateTolerance
      || previous.x >= target.x)) {
      continue;
    }

    // The junction must lie on every final horizontal segment so none of the
    // safe ELK route before it has to be replaced.
    const latestSegmentStart = Math.max(...members.map(({ previous }) => previous.x));
    const point = {
      x: Math.max(target.x - preferredTrunkLength, latestSegmentStart),
      y: target.y,
    };
    const first = group[0]!;
    junctions.push({
      key,
      kind: first.kind,
      target: first.target,
      targetPort: first.targetPort,
      point,
      trunkPath: [point, target],
      branches: members.map(({ edge, path }) => ({
        edgeId: edge.id,
        paths: [replaceTarget(path, point)],
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
    previous: path.at(-2)!,
  };
}

function replaceTarget(path: readonly LayoutPoint[], point: LayoutPoint): LayoutPoint[] {
  const prefix = path.slice(0, -1);
  const previous = prefix.at(-1);
  if (previous && previous.x === point.x && previous.y === point.y) return prefix;
  return [...prefix, point];
}
