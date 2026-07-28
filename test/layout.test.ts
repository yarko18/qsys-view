// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { layoutAnchoredGraph, pathMidpoint, projectVisibleLayout } from '../layout/elk';
import type { ConnectionKind, QsysConnection, QsysModule } from '../parser/graph';

function module(id: string): QsysModule {
  return { id, name: id, type: 'test.ip', disabled: false, parameters: {}, ports: [] };
}

function connection(id: string, source: string, target: string, kind: ConnectionKind): QsysConnection {
  return {
    id,
    source,
    sourcePort: 'out',
    target,
    targetPort: 'in',
    kind,
    rawKind: kind,
    parameters: {},
  };
}

describe('Avalon-ST anchored layout', () => {
  it('does not move streaming nodes when non-streaming modules and links are added', async () => {
    const source = module('stream_source');
    const sink = module('stream_sink');
    const control = module('control_master');
    const peripheral = module('peripheral');
    const streaming = connection('st', source.id, sink.id, 'avalon_streaming');
    const memoryMapped = connection('mm', source.id, control.id, 'avalon_memory_mapped');
    const satelliteLink = connection('mm-satellite', control.id, peripheral.id, 'avalon_memory_mapped');

    const streamingOnly = await layoutAnchoredGraph([source, sink], [streaming]);
    const complete = await layoutAnchoredGraph(
      [source, sink, control, peripheral],
      [streaming, memoryMapped, satelliteLink],
    );

    for (const id of [source.id, sink.id]) {
      const before = streamingOnly.nodes.find((node) => node.id === id);
      const after = complete.nodes.find((node) => node.id === id);
      expect(after && { x: after.x, y: after.y }).toEqual(before && { x: before.x, y: before.y });
    }

    const stView = projectVisibleLayout(complete, [source, sink], [streaming]);
    const combinedView = projectVisibleLayout(complete, [source, sink, control], [streaming, memoryMapped]);
    for (const id of [source.id, sink.id]) {
      const before = stView.nodes.find((node) => node.id === id);
      const after = combinedView.nodes.find((node) => node.id === id);
      expect(after && { x: after.x, y: after.y }).toEqual(before && { x: before.x, y: before.y });
    }
    expect(combinedView.edges.find((edge) => edge.id === memoryMapped.id)?.paths[0]?.length).toBeGreaterThan(1);
  });
});

describe('pathMidpoint', () => {
  it('finds the halfway point across orthogonal segments', () => {
    expect(pathMidpoint([[
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ]])).toEqual({ x: 10, y: 5 });
  });
});
