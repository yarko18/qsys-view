// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { ConnectionKind } from '../parser/graph';
import type { LayoutEdge } from '../layout/elk';
import { createOutputJunctions } from '../webview/outputJunctions';

function fanoutEdge(
  id: string,
  target: string,
  targetY: number,
  bendX: number,
  kind: ConnectionKind = 'other',
): LayoutEdge {
  return {
    id,
    source: 'nios2',
    sourcePort: 'cpu_receiver_irq',
    target,
    targetPort: 'irq',
    kind,
    rawKind: kind === 'other' ? 'unknown (static Tcl)' : kind,
    parameters: {},
    paths: [[
      { x: 100, y: 180 },
      { x: bendX, y: 180 },
      { x: bendX, y: targetY },
      { x: 400, y: targetY },
    ]],
  };
}

describe('source-domain junctions', () => {
  it.each<ConnectionKind>(['interrupt', 'conduit', 'other'])(
    'marks one shared %s output before its branches diverge',
    (kind) => {
      const junction = createOutputJunctions([
        fanoutEdge('i2c', 'i2c', 80, 280, kind),
        fanoutEdge('pio', 'pio', 180, 300, kind),
        fanoutEdge('spi', 'spi', 260, 320, kind),
      ])[0]!;

      expect(junction).toMatchObject({
        kind,
        source: 'nios2',
        sourcePort: 'cpu_receiver_irq',
        point: { x: 280, y: 180 },
        trunkPath: [{ x: 100, y: 180 }, { x: 280, y: 180 }],
      });
      expect(junction.branches.map((branch) => branch.edgeId)).toEqual(['i2c', 'pio', 'spi']);
      for (const branch of junction.branches) {
        expect(branch.paths[0]![0]).toEqual(junction.point);
      }
    },
  );

  it('never combines different sources merely because they share a sink', () => {
    const first = fanoutEdge('data', 'lpddr2', 180, 280, 'interrupt');
    const second = {
      ...fanoutEdge('instruction', 'lpddr2', 180, 300, 'interrupt'),
      sourcePort: 'instruction_master',
      paths: [[
        { x: 100, y: 200 },
        { x: 300, y: 200 },
        { x: 300, y: 180 },
        { x: 400, y: 180 },
      ]],
    };

    expect(createOutputJunctions([first, second])).toEqual([]);
  });

  it('leaves Avalon-MM fan-out to its bus and rejects Avalon-ST junctions', () => {
    for (const kind of ['avalon_memory_mapped', 'avalon_streaming'] as const) {
      expect(createOutputJunctions([
        fanoutEdge('first', 'first', 80, 280, kind),
        fanoutEdge('second', 'second', 260, 320, kind),
      ])).toEqual([]);
    }
  });
});
