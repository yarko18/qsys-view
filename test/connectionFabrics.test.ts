// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { layoutGraph } from '../layout/elk';
import type { ConnectionKind, QsysConnection, QsysModule } from '../parser/graph';
import { createConnectionFabricGraph } from '../webview/connectionFabrics';

function module(id: string): QsysModule {
  return { id, name: id, type: 'test.ip', disabled: false, parameters: {}, ports: [] };
}

function connection(
  id: string,
  source: string,
  sourcePort: string,
  target: string,
  targetPort: string,
  kind: ConnectionKind = 'avalon_memory_mapped',
): QsysConnection {
  return { id, source, sourcePort, target, targetPort, kind, rawKind: kind, parameters: {} };
}

describe('connection fabrics', () => {
  it('keeps a P2P connection unchanged', () => {
    const link = connection('link', 'master', 'm0', 'slave', 's0');
    const result = createConnectionFabricGraph([module('master'), module('slave')], [link]);

    expect(result.fabrics).toEqual([]);
    expect(result.connections).toEqual([link]);
  });

  it('represents one source and many targets with one fabric input', () => {
    const result = createConnectionFabricGraph(
      [module('master'), module('first'), module('second')],
      [
        connection('first', 'master', 'm0', 'first', 's0'),
        connection('second', 'master', 'm0', 'second', 's0'),
      ],
    );

    expect(result.fabrics).toHaveLength(1);
    expect(result.fabrics[0]!.inputs).toHaveLength(1);
    expect(result.fabrics[0]!.outputs).toHaveLength(2);
    expect(result.connections).toHaveLength(3);
  });

  it('represents many sources and one target with one fabric output', () => {
    const result = createConnectionFabricGraph(
      [module('first'), module('second'), module('slave')],
      [
        connection('first', 'first', 'm0', 'slave', 's0', 'other'),
        connection('second', 'second', 'm0', 'slave', 's0', 'other'),
      ],
    );

    expect(result.fabrics[0]!.kind).toBe('other');
    expect(result.fabrics[0]!.inputs).toHaveLength(2);
    expect(result.fabrics[0]!.outputs).toHaveLength(1);
    expect(result.connections).toHaveLength(3);
  });

  it('collapses a multi-source multi-target component without duplicating endpoints', () => {
    const links = [
      connection('a0', 'a', 'm0', 'x', 's0'),
      connection('a1', 'a', 'm0', 'y', 's0'),
      connection('b0', 'b', 'm0', 'x', 's0'),
      connection('b1', 'b', 'm0', 'y', 's0'),
    ];
    const result = createConnectionFabricGraph(
      ['a', 'b', 'x', 'y'].map(module),
      links,
    );

    expect(result.fabrics[0]!.inputs).toHaveLength(2);
    expect(result.fabrics[0]!.outputs).toHaveLength(2);
    expect(result.fabrics[0]!.connections).toEqual(links);
    expect(result.connections).toHaveLength(4);
  });

  it('never turns invalid Avalon-ST fan-in or fan-out into an interconnect', () => {
    const links = [
      connection('first', 'source', 'out', 'first', 'in', 'avalon_streaming'),
      connection('second', 'source', 'out', 'second', 'in', 'avalon_streaming'),
    ];
    const result = createConnectionFabricGraph(
      ['source', 'first', 'second'].map(module),
      links,
    );

    expect(result.fabrics).toEqual([]);
    expect(result.connections).toEqual(links);
  });

  it('keeps a local self-loop outside a shared interconnect', () => {
    const local = connection('debug', 'cpu', 'data_master', 'cpu', 'debug_slave');
    const links = [
      local,
      connection('timer', 'cpu', 'data_master', 'timer', 's0'),
      connection('memory', 'cpu', 'data_master', 'memory', 's0'),
    ];
    const result = createConnectionFabricGraph(
      ['cpu', 'timer', 'memory'].map(module),
      links,
    );

    expect(result.connections).toContain(local);
    expect(result.fabrics[0]!.connections.map(({ id }) => id)).toEqual(['memory', 'timer']);
  });

  it('supports one-sided IRQ junction topology', () => {
    const links = [
      connection('first', 'receiver', 'irq', 'first', 'irq', 'interrupt'),
      connection('second', 'receiver', 'irq', 'second', 'irq', 'interrupt'),
    ];
    const result = createConnectionFabricGraph(
      ['receiver', 'first', 'second'].map(module),
      links,
    );

    expect(result.fabrics[0]).toMatchObject({ kind: 'interrupt' });
    expect(result.fabrics[0]!.inputs).toHaveLength(1);
    expect(result.fabrics[0]!.outputs).toHaveLength(2);
  });

  it('keeps the fabric and endpoint identities stable when another branch is appended', () => {
    const initial = [
      connection('first', 'master', 'm0', 'first', 's0'),
      connection('second', 'master', 'm0', 'second', 's0'),
    ];
    const changed = [...initial, connection('third', 'master', 'm0', 'third', 's0')];
    const before = createConnectionFabricGraph(['master', 'first', 'second'].map(module), initial).fabrics[0]!;
    const after = createConnectionFabricGraph(['master', 'first', 'second', 'third'].map(module), changed).fabrics[0]!;

    expect(after.id).toBe(before.id);
    expect(after.inputs[0]!.edgeId).toBe(before.inputs[0]!.edgeId);
    expect(after.outputs.slice(0, 2).map(({ edgeId }) => edgeId))
      .toEqual(before.outputs.map(({ edgeId }) => edgeId));
  });

  it('lays independent source and target domains on distinct interconnect ports', async () => {
    const links = [
      connection('a0', 'cpu', 'data_master', 'rom', 's0'),
      connection('a1', 'cpu', 'data_master', 'memory', 's0'),
      connection('b0', 'cpu', 'instruction_master', 'rom', 's0'),
      connection('b1', 'cpu', 'instruction_master', 'memory', 's0'),
    ];
    const graph = createConnectionFabricGraph(['cpu', 'rom', 'memory'].map(module), links);
    const layout = await layoutGraph(graph.modules, graph.connections);
    const fabric = graph.fabrics[0]!;
    const inputYs = fabric.inputs.map(({ edgeId }) =>
      layout.edges.find(({ id }) => id === edgeId)!.paths[0]!.at(-1)!.y);
    const outputYs = fabric.outputs.map(({ edgeId }) =>
      layout.edges.find(({ id }) => id === edgeId)!.paths[0]![0]!.y);

    expect(new Set(inputYs).size).toBe(2);
    expect(new Set(outputYs).size).toBe(2);
    expect(Math.abs(inputYs[0]! - inputYs[1]!)).toBeGreaterThanOrEqual(18);
    expect(Math.abs(outputYs[0]! - outputYs[1]!)).toBeGreaterThanOrEqual(18);
  });
});
