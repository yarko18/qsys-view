// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { ConnectionKind, QsysConnection, QsysGraph, QsysModule } from '../parser/graph';
import { connectionAddress, createInterfaceHubs } from '../webview/interfaceHubs';

function module(id: string, parameters: Record<string, string> = {}): QsysModule {
  return { id, name: id, type: 'test.ip', disabled: false, parameters, ports: [] };
}

function connection(
  id: string,
  source: string,
  sourcePort: string,
  target: string,
  targetPort: string,
  kind: ConnectionKind,
  parameters: Record<string, string> = {},
): QsysConnection {
  return { id, source, sourcePort, target, targetPort, kind, rawKind: kind, parameters };
}

describe('interface hubs', () => {
  it('groups masters and IRQ receivers and uses serialized addresses and known clock frequencies', () => {
    const modules = [
      module('master'), module('slave_a'), module('slave_b'),
      module('clk_video', { clockFrequencyKnown: 'true', clockFrequency: '55000000' }),
      module('clk_unknown', { clockFrequencyKnown: 'false', clockFrequency: '100000000' }),
      module('irq_a'), module('irq_b'), module('cpu'),
    ];
    const connections = [
      connection('mm-a', 'master', 'm0', 'slave_a', 'control', 'avalon_memory_mapped', { baseAddress: '0x1000' }),
      connection('mm-b', 'master', 'm0', 'slave_b', 'control', 'avalon_memory_mapped', { baseAddress: '0x2000' }),
      connection('clk-a', 'clk_video', 'clk', 'slave_a', 'clk', 'clock'),
      connection('clk-b', 'clk_unknown', 'clk', 'slave_b', 'clk', 'clock'),
      connection('irq-a', 'irq_a', 'irq', 'cpu', 'irq', 'interrupt'),
      connection('irq-b', 'irq_b', 'irq', 'cpu', 'irq', 'interrupt'),
    ];
    const graph: QsysGraph = {
      name: 'test', modules, connections, interfaces: {}, warnings: [],
      metadata: { source: 'qsys-only', label: 'test' },
    };
    const hubs = createInterfaceHubs(
      graph,
      ['avalon_memory_mapped', 'clock', 'interrupt'],
      new Set(modules.map((item) => item.id)),
    );

    const mm = hubs.find((hub) => hub.id === 'avalon_memory_mapped:master.m0');
    expect(mm?.relatedModuleIds).toEqual(['slave_a', 'slave_b']);
    expect(connectionAddress(mm!.connections[0]!)).toBe('0x1000');
    expect(hubs.find((hub) => hub.endpoint === 'clk_video.clk')?.frequency).toBe('55 MHz');
    expect(hubs.find((hub) => hub.endpoint === 'clk_unknown.clk')?.frequency).toBeUndefined();
    expect(hubs.find((hub) => hub.id === 'interrupt:cpu.irq')?.relatedModuleIds).toEqual(['irq_a', 'irq_b']);
  });

  it('groups equivalent domains on both sides of an expanded subsystem boundary', () => {
    const modules = [module('root_clock'), module('nested/bridge'), module('nested/consumer')];
    const connections = [
      connection('boundary-clock', 'root_clock', 'clk', 'nested/bridge', 'clk_in', 'clock'),
      connection('inner-clock', 'nested/bridge', 'clk', 'nested/consumer', 'clk', 'clock'),
      connection('boundary-reset', 'root_clock', 'clk_reset', 'nested/bridge', 'clk_in_reset', 'reset'),
      connection('inner-reset', 'nested/bridge', 'clk_reset', 'nested/consumer', 'reset', 'reset'),
    ];
    const graph: QsysGraph = {
      name: 'test', modules, connections, interfaces: {}, warnings: [],
      metadata: { source: 'qsys-only', label: 'test' },
      domainAliases: {
        'nested/bridge.clk': 'root_clock.clk',
        'nested/bridge.clk_reset': 'root_clock.clk_reset',
      },
    };

    const hubs = createInterfaceHubs(graph, ['clock', 'reset'], new Set(modules.map((item) => item.id)));

    expect(hubs.filter((hub) => hub.kind === 'clock')).toHaveLength(1);
    expect(hubs.find((hub) => hub.kind === 'clock')).toMatchObject({
      endpoint: 'root_clock.clk',
      relatedModuleIds: ['nested/bridge', 'nested/consumer'],
    });
    expect(hubs.filter((hub) => hub.kind === 'reset')).toHaveLength(1);
    expect(hubs.find((hub) => hub.kind === 'reset')?.endpoint).toBe('root_clock.clk_reset');
  });
});
