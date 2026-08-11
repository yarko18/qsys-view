// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { ConnectionKind } from '../parser/graph';
import type { LayoutEdge } from '../layout/elk';
import { createInputJunctions, createOutputJunctions } from '../webview/inputJunctions';

function edge(
  id: string,
  source: string,
  sourceY: number,
  bendX: number,
  targetPort = 'avl_1',
  kind: ConnectionKind = 'avalon_memory_mapped',
): LayoutEdge {
  return {
    id,
    source,
    sourcePort: 'master',
    target: 'lpddr2',
    targetPort,
    kind,
    rawKind: kind === 'other' ? 'unknown (static Tcl)' : kind,
    parameters: {},
    paths: [[
      { x: 100, y: sourceY },
      { x: bendX, y: sourceY },
      { x: bendX, y: 180 },
      { x: 400, y: 180 },
    ]],
  };
}

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

  it('does not merge separate target ports', () => {
    expect(createInputJunctions([
      edge('avl-0', 'cpu', 80, 280, 'avl_0'),
      edge('avl-1', 'video', 140, 300, 'avl_1'),
    ])).toEqual([]);
  });

  it.each<ConnectionKind>([
    'avalon_memory_mapped',
    'interrupt',
    'conduit',
    'other',
  ])('creates a junction for %s connections', (kind) => {
    const first = edge('first', 'source_0', 80, 280, 'shared_input', kind);
    const second = edge('second', 'source_1', 240, 320, 'shared_input', kind);

    const junction = createInputJunctions([first, second])[0]!;

    expect(junction.kind).toBe(kind);
    expect(junction.targetPort).toBe('shared_input');
    expect(junction.branches.map((branch) => branch.edgeId)).toEqual(['first', 'second']);
  });

  it('groups an unresolved and resolved connection by endpoint, not classification', () => {
    const unresolved = edge('unknown', 'source_0', 80, 280, 'shared_input', 'other');
    const resolved = edge('resolved', 'source_1', 240, 320, 'shared_input', 'conduit');

    const junction = createInputJunctions([unresolved, resolved])[0]!;

    expect(junction.kind).toBe('conduit');
    expect(junction.branches).toHaveLength(2);
  });

  it('never presents Avalon-ST fan-in as a valid junction', () => {
    expect(createInputJunctions([
      edge('stream-0', 'source_0', 80, 280, 'din', 'avalon_streaming'),
      edge('stream-1', 'source_1', 240, 320, 'din', 'avalon_streaming'),
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

describe('output junctions', () => {
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

  it('leaves Avalon-MM fan-out to its bus and rejects Avalon-ST junctions', () => {
    for (const kind of ['avalon_memory_mapped', 'avalon_streaming'] as const) {
      expect(createOutputJunctions([
        fanoutEdge('first', 'first', 80, 280, kind),
        fanoutEdge('second', 'second', 260, 320, kind),
      ])).toEqual([]);
    }
  });
});
