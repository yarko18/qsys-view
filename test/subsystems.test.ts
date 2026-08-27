// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { QsysGraph, QsysModule } from '../parser/graph';
import { subsystemBuildPlan, subsystemCandidatePaths, tclSubsystemBuildOrder } from '../src/subsystems';

describe('subsystemCandidatePaths', () => {
  it('prefers the same source format as the parent system', () => {
    expect(subsystemCandidatePaths('/work/platform1.qsys', 'platform2')).toEqual([
      '/work/platform2.qsys',
      '/work/platform2.tcl',
    ]);
    expect(subsystemCandidatePaths('/work/platform1.tcl', 'platform2')).toEqual([
      '/work/platform2.tcl',
      '/work/platform2.qsys',
    ]);
  });

  it('rejects module types that could escape the parent directory', () => {
    expect(subsystemCandidatePaths('/work/platform1.qsys', '../platform2')).toEqual([]);
  });
});

function graph(name: string, modules: QsysModule[] = []): QsysGraph {
  return {
    name,
    modules,
    connections: [],
    interfaces: {},
    metadata: { source: 'qsys-only', label: 'test' },
    warnings: [],
  };
}

function subsystem(id: string, resource: string, format: 'tcl' | 'qsys' = 'tcl'): QsysModule {
  return {
    id,
    name: id,
    type: id,
    disabled: false,
    parameters: {},
    ports: [],
    subsystem: { resource, format },
  };
}

describe('tclSubsystemBuildOrder', () => {
  it('builds recursive dependencies before parents and ignores cycles and duplicates', async () => {
    const root = graph('root', [subsystem('a0', 'file:///a.tcl'), subsystem('a1', 'file:///a.tcl')]);
    const children = new Map([
      ['file:///a.tcl', graph('a', [subsystem('b', 'file:///b.tcl')])],
      ['file:///b.tcl', graph('b', [subsystem('root', 'file:///root.tcl')])],
    ]);

    const order = await tclSubsystemBuildOrder(
      'file:///root.tcl',
      root,
      async (resource) => children.get(resource)!,
    );

    expect(order).toEqual(['file:///b.tcl', 'file:///a.tcl']);
  });

  it('plans Tcl builds and Qsys-only staging recursively without duplicates', async () => {
    const root = graph('root', [
      subsystem('a', 'file:///a.tcl'),
      subsystem('c', 'file:///c.qsys', 'qsys'),
    ]);
    const children = new Map([
      ['file:///a.tcl', graph('a', [subsystem('b', 'file:///b.qsys', 'qsys')])],
      ['file:///b.qsys', graph('b')],
      ['file:///c.qsys', graph('c', [subsystem('b', 'file:///b.qsys', 'qsys')])],
    ]);

    const plan = await subsystemBuildPlan(
      'file:///root.tcl',
      root,
      async (resource) => children.get(resource)!,
    );

    expect(plan).toEqual({
      tcl: ['file:///a.tcl'],
      qsys: ['file:///b.qsys', 'file:///c.qsys'],
    });
  });
});
