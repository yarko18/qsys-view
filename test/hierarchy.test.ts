// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { QsysConnection, QsysGraph, QsysModule } from '../parser/graph';
import { composeHierarchy } from '../webview/hierarchy';

function module(id: string, type = 'ip'): QsysModule {
  return { id, name: id, type, disabled: false, parameters: {}, ports: [] };
}

function connection(id: string, source: string, sourcePort: string, target: string, targetPort: string): QsysConnection {
  return {
    id,
    source,
    sourcePort,
    target,
    targetPort,
    kind: 'avalon_streaming',
    rawKind: 'avalon_streaming',
    parameters: {},
  };
}

function graph(name: string, modules: QsysModule[], connections: QsysConnection[] = []): QsysGraph {
  return {
    name,
    modules,
    connections,
    interfaces: {},
    metadata: { source: 'qsys-only', label: 'test' },
    warnings: [],
  };
}

describe('composeHierarchy', () => {
  it('keeps subsystem instances collapsed until explicitly expanded', () => {
    const root = graph('root', [module('source'), module('platform2_0', 'platform2')]);
    expect(composeHierarchy(root, new Map()).modules.map((item) => item.id)).toEqual([
      'source', 'platform2_0',
    ]);
  });

  it('replaces an expanded subsystem and reconnects its exported interfaces', () => {
    const root = graph('root', [module('source'), module('platform2_0', 'platform2'), module('sink')], [
      connection('to-child', 'source', 'out', 'platform2_0', 'din'),
      connection('from-child', 'platform2_0', 'dout', 'sink', 'in'),
    ]);
    const child = {
      ...graph('platform2', [module('fifo'), module('scaler')], [
        connection('pipeline', 'fifo', 'out', 'scaler', 'in'),
      ]),
      exportedInterfaces: { din: 'fifo.in', dout: 'scaler.out' },
    };
    const composed = composeHierarchy(root, new Map([['platform2_0', child]]));

    expect(composed.modules.map((item) => item.id)).toEqual([
      'source', 'platform2_0/fifo', 'platform2_0/scaler', 'sink',
    ]);
    expect(composed.modules.find((item) => item.id === 'platform2_0/fifo')?.hierarchyPath)
      .toEqual(['platform2_0']);
    expect(composed.connections.map(({ source, sourcePort, target, targetPort }) =>
      `${source}.${sourcePort}->${target}.${targetPort}`)).toEqual([
      'platform2_0/fifo.out->platform2_0/scaler.in',
      'source.out->platform2_0/fifo.in',
      'platform2_0/scaler.out->sink.in',
    ]);
  });

  it('supports explicit recursive expansion without opening descendants automatically', () => {
    const root = graph('root', [module('outer', 'child')]);
    const child = graph('child', [module('inner', 'grandchild'), module('peer')]);
    const grandchild = graph('grandchild', [module('leaf')]);
    const onlyOuter = composeHierarchy(root, new Map([['outer', child]]));
    expect(onlyOuter.modules.map((item) => item.id)).toEqual(['outer/inner', 'outer/peer']);

    const recursive = composeHierarchy(root, new Map([
      ['outer', child],
      ['outer/inner', grandchild],
    ]));
    expect(recursive.modules.map((item) => item.id)).toEqual(['outer/inner/leaf', 'outer/peer']);
  });
});
