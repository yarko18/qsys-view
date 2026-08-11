// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { LayoutEdge } from '../layout/elk';
import { createInputJunctions } from '../webview/inputJunctions';

function edge(id: string, source: string, sourceY: number, bendX: number, targetPort = 'avl_1'): LayoutEdge {
  return {
    id,
    source,
    sourcePort: 'master',
    target: 'lpddr2',
    targetPort,
    kind: 'avalon_memory_mapped',
    rawKind: 'avalon',
    parameters: {},
    paths: [[
      { x: 100, y: sourceY },
      { x: bendX, y: sourceY },
      { x: bendX, y: 180 },
      { x: 400, y: 180 },
    ]],
  };
}

describe('input junctions', () => {
  it('joins three sources before one shared target interface', () => {
    const junctions = createInputJunctions([
      edge('read', 'fb_read', 80, 280),
      edge('write', 'fb_write', 140, 300),
      edge('capture', 'capture', 220, 320),
    ]);

    expect(junctions).toHaveLength(1);
    expect(junctions[0]).toMatchObject({
      kind: 'avalon_memory_mapped',
      target: 'lpddr2',
      targetPort: 'avl_1',
      point: { x: 320, y: 180 },
      trunkPath: [{ x: 320, y: 180 }, { x: 400, y: 180 }],
    });
    expect(junctions[0]!.branches).toHaveLength(3);
    for (const branch of junctions[0]!.branches) {
      expect(branch.paths[0]!.at(-1)).toEqual(junctions[0]!.point);
    }
  });

  it('does not merge separate target ports or unsafe backward approaches', () => {
    const backward = edge('backward', 'debug', 200, 300);
    backward.paths = [[{ x: 500, y: 200 }, { x: 400, y: 180 }]];
    expect(createInputJunctions([
      edge('avl-0', 'cpu', 80, 280, 'avl_0'),
      edge('avl-1', 'video', 140, 300, 'avl_1'),
      backward,
    ])).toEqual([]);
  });

  it('moves the dot to the beginning of a multi-segment shared suffix', () => {
    const first = edge('first', 'capture', 80, 260);
    const second = edge('second', 'nuc', 240, 280);
    first.paths = [[
      { x: 100, y: 80 },
      { x: 260, y: 80 },
      { x: 260, y: 160 },
      { x: 320, y: 160 },
      { x: 320, y: 180 },
      { x: 400, y: 180 },
    ]];
    second.paths = [[
      { x: 100, y: 240 },
      { x: 280, y: 240 },
      { x: 280, y: 160 },
      { x: 320, y: 160 },
      { x: 320, y: 180 },
      { x: 400, y: 180 },
    ]];

    const junction = createInputJunctions([first, second])[0]!;

    expect(junction.point).toEqual({ x: 280, y: 160 });
    expect(junction.trunkPath).toEqual([
      { x: 280, y: 160 },
      { x: 320, y: 160 },
      { x: 320, y: 180 },
      { x: 400, y: 180 },
    ]);
  });
});
