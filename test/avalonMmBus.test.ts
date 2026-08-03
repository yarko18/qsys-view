// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { LayoutEdge } from '../layout/elk';
import { createAvalonMmBuses } from '../webview/avalonMmBus';

function edge(id: string, sourcePort: string, target: string, sourceY: number, targetY: number): LayoutEdge {
  return {
    id,
    source: 'cpu',
    sourcePort,
    target,
    targetPort: 's0',
    kind: 'avalon_memory_mapped',
    rawKind: 'avalon',
    parameters: {},
    paths: [[{ x: 100, y: sourceY }, { x: 400, y: targetY }]],
  };
}

describe('createAvalonMmBuses', () => {
  it('groups multiple slaves of one master into a trunk and selectable branches', () => {
    const buses = createAvalonMmBuses([
      edge('timer', 'data_master', 'timer', 100, 60),
      edge('uart', 'data_master', 'uart', 100, 160),
    ]);

    expect(buses).toHaveLength(1);
    expect(buses[0]).toMatchObject({
      source: 'cpu',
      sourcePort: 'data_master',
      sourcePath: [{ x: 100, y: 100 }, { x: 250, y: 100 }],
      trunkPath: [{ x: 250, y: 60 }, { x: 250, y: 160 }],
      branches: [
        { edgeId: 'timer', paths: [[{ x: 250, y: 60 }, { x: 400, y: 60 }]] },
        { edgeId: 'uart', paths: [[{ x: 250, y: 160 }, { x: 400, y: 160 }]] },
      ],
    });
  });

  it('keeps single, separate-port, and backward connections as normal edges', () => {
    const backward = edge('backward', 'instruction_master', 'memory', 200, 200);
    backward.paths = [[{ x: 400, y: 200 }, { x: 100, y: 200 }]];
    expect(createAvalonMmBuses([
      edge('only', 'data_master', 'timer', 100, 60),
      backward,
    ])).toEqual([]);
  });
});
