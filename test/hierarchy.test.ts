// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { QsysConnection, QsysGraph, QsysModule } from '../parser/graph';
import { parseQsys } from '../parser/qsysParser';
import { parseQsysTcl } from '../parser/qsysTclParser';
import { composeHierarchy, hierarchyBounds } from '../webview/hierarchy';

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

function typedConnection(
  id: string,
  source: string,
  sourcePort: string,
  target: string,
  targetPort: string,
  kind: QsysConnection['kind'],
): QsysConnection {
  return { ...connection(id, source, sourcePort, target, targetPort), kind, rawKind: kind };
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

  it('preserves clock and reset domain identity across an expanded clock_source', () => {
    const root = graph('root', [module('root_clock', 'clock_source'), module('nested', 'child')], [
      typedConnection('child-clock', 'root_clock', 'clk', 'nested', 'clock', 'clock'),
      typedConnection('child-reset', 'root_clock', 'clk_reset', 'nested', 'reset', 'reset'),
    ]);
    const child = {
      ...graph('child', [module('bridge', 'clock_source'), module('consumer')], [
        typedConnection('clock', 'bridge', 'clk', 'consumer', 'clk', 'clock'),
        typedConnection('reset', 'bridge', 'clk_reset', 'consumer', 'reset', 'reset'),
      ]),
      exportedInterfaces: { clock: 'bridge.clk_in', reset: 'bridge.clk_in_reset' },
    };

    const composed = composeHierarchy(root, new Map([['nested', child]]));

    expect(composed.domainAliases).toEqual({
      'nested/bridge.clk': 'root_clock.clk',
      'nested/bridge.clk_reset': 'root_clock.clk_reset',
    });
  });

  it.each(['qsys', 'tcl'] as const)('expands the real platform1.%s example through platform2 exports', (format) => {
    const parse = format === 'qsys' ? parseQsys : parseQsysTcl;
    const root = parse(readFileSync(new URL(`../example/platform1.${format}`, import.meta.url), 'utf8'), 'platform1');
    const child = parse(readFileSync(new URL(`../example/platform2.${format}`, import.meta.url), 'utf8'), 'platform2');
    const composed = composeHierarchy(root, new Map([['platform2_0', child]]));

    expect(composed.modules.some((item) => item.id === 'platform2_0')).toBe(false);
    expect(composed.modules.some((item) => item.id === 'platform2_0/sc_fifo_0')).toBe(true);
    expect(composed.connections).toContainEqual(expect.objectContaining({
      source: 'fir',
      sourcePort: 'dout',
      target: 'platform2_0/sc_fifo_0',
      targetPort: 'in',
    }));
    expect(composed.connections).toContainEqual(expect.objectContaining({
      source: 'platform2_0/scaler',
      sourcePort: 'dout',
      target: 'clipper',
      targetPort: 'din',
    }));
  });
});

describe('hierarchyBounds', () => {
  it('surrounds visible descendants without including neighbouring modules', () => {
    const nodes = [
      { id: 'nested/a', x: 100, y: 80, width: 150, height: 70 },
      { id: 'nested/deeper/b', x: 300, y: 160, width: 180, height: 70 },
      { id: 'outside', x: 20, y: 20, width: 500, height: 300 },
    ];

    expect(hierarchyBounds(nodes, 'nested')).toEqual({
      x: 82,
      y: 38,
      width: 416,
      height: 210,
    });
    expect(hierarchyBounds(nodes, 'missing')).toBeUndefined();
  });
});
