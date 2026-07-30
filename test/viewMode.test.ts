// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { ConnectionKind, QsysConnection } from '../parser/graph';
import { availableConnectionKinds, canUsePipelineView, connectedModuleIds, inferClockResetConnections, isDirectKind, isHubKind } from '../webview/viewMode';

const kinds: ConnectionKind[] = [
  'avalon_streaming',
  'avalon_memory_mapped',
  'clock',
  'reset',
  'interrupt',
  'conduit',
  'other',
];

describe('graph view modes', () => {
  it('draws only Avalon-ST and conduit edges in pipeline mode', () => {
    expect(kinds.filter((kind) => isDirectKind(kind, 'pipeline'))).toEqual([
      'avalon_streaming', 'conduit',
    ]);
    expect(kinds.filter((kind) => isHubKind(kind, 'pipeline'))).toEqual([
      'avalon_memory_mapped', 'clock', 'reset', 'interrupt',
    ]);
  });

  it('draws the complete topology while keeping clock and reset as hubs', () => {
    expect(kinds.filter((kind) => isDirectKind(kind, 'complete'))).toEqual([
      'avalon_streaming', 'avalon_memory_mapped', 'interrupt', 'conduit', 'other',
    ]);
    expect(kinds.filter((kind) => isHubKind(kind, 'complete'))).toEqual(['clock', 'reset']);
  });

  it('offers filters only for kinds present in the graph and meaningful in the mode', () => {
    const present: ConnectionKind[] = ['avalon_streaming', 'clock', 'reset', 'other'];
    expect(availableConnectionKinds(present, 'pipeline')).toEqual([
      'avalon_streaming', 'clock', 'reset',
    ]);
    expect(availableConnectionKinds(present, 'complete')).toEqual(present);
  });
});

describe('connected module visibility', () => {
  it('ignores clock/reset-only relationships but keeps direct and functional hub endpoints', () => {
    const direct: QsysConnection[] = [{
      id: 'stream',
      source: 'video_in',
      sourcePort: 'out',
      target: 'scaler',
      targetPort: 'in',
      kind: 'avalon_streaming',
      rawKind: 'avalon_streaming',
      parameters: {},
    }];
    const visible = connectedModuleIds(direct, [
      { kind: 'clock', moduleId: 'clock_source', relatedModuleIds: ['clock_only_bridge'] },
      { kind: 'avalon_memory_mapped', moduleId: 'cpu', relatedModuleIds: ['control_slave'] },
    ]);

    expect([...visible].sort()).toEqual([
      'control_slave', 'cpu', 'scaler', 'video_in',
    ]);
  });
});

describe('Pipeline availability', () => {
  it('requires exact metadata for every Tcl level but not for Qsys', () => {
    expect(canUsePipelineView([
      { resource: 'file:///design.qsys', exactMetadata: false },
    ])).toBe(true);
    expect(canUsePipelineView([
      { resource: 'file:///design.tcl', exactMetadata: false },
    ])).toBe(false);
    expect(canUsePipelineView([
      { resource: 'file:///design.tcl', exactMetadata: true },
      { resource: 'file:///child.tcl', exactMetadata: true },
    ])).toBe(true);
    expect(canUsePipelineView([
      { resource: 'file:///design.qsys', exactMetadata: false },
      { resource: 'file:///child.tcl', exactMetadata: false },
    ])).toBe(false);
  });
});

describe('clock and reset name inference', () => {
  function unknown(sourcePort: string, targetPort: string): QsysConnection {
    return {
      id: `${sourcePort}-${targetPort}`,
      source: 'source',
      sourcePort,
      target: 'target',
      targetPort,
      kind: 'other',
      rawKind: 'unknown (static Tcl)',
      parameters: {},
    };
  }

  it.each(['reset', 'main_reset', 'reset_n', 'rst', 'rst_n', 'nrst', 'rstn', 'clk_reset'])(
    'recognizes reset interface name %s',
    (name) => expect(inferClockResetConnections([unknown('out', name)], true)[0]?.kind).toBe('reset'),
  );

  it.each(['clk', 'main_clk', 'clock', 'video_clock'])(
    'recognizes clock interface name %s',
    (name) => expect(inferClockResetConnections([unknown(name, 'input')], true)[0]?.kind).toBe('clock'),
  );

  it('can be disabled and never overrides an explicit type', () => {
    const namedReset = unknown('reset_n', 'rst');
    const explicit = { ...namedReset, kind: 'conduit' as const, rawKind: 'conduit' };
    expect(inferClockResetConnections([namedReset], false)[0]?.kind).toBe('other');
    expect(inferClockResetConnections([explicit], true)[0]?.kind).toBe('conduit');
  });
});
