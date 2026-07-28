// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { QsysGraph, QsysInterface, QsysInterfacePort } from '../parser/graph';
import { annotateStreamingAdapters, detectStreamingAdaptations } from '../parser/streamAdapters';

function iface(
  parameters: Record<string, string> = {},
  roles: Record<string, number> = { data: 16, valid: 1, ready: 1 },
): QsysInterface {
  const ports: QsysInterfacePort[] = Object.entries(roles).map(([role, width]) => ({
    name: role,
    role,
    direction: 'Input',
    width,
  }));
  return { module: 'ip', name: 'stream', kind: 'avalon_streaming', parameters, ports, source: 'quartus' };
}

describe('detectStreamingAdaptations', () => {
  it('detects the ready-latency adapters around the example FIFO', () => {
    const source = iface({ readyLatency: '1', symbolsPerBeat: '1', maxChannel: '0', errorDescriptor: '' });
    const fifo = iface({ readyLatency: '0', symbolsPerBeat: '1', maxChannel: '0', errorDescriptor: '' });

    expect(detectStreamingAdaptations(source, fifo)).toEqual([{
      kind: 'timing',
      differences: [{ property: 'readyLatency', source: '1', target: '0' }],
    }]);
  });

  it('groups data-format, channel and error differences by adapter kind', () => {
    const source = iface(
      { readyLatency: '0', symbolsPerBeat: '2', maxChannel: '7', errorDescriptor: 'overflow' },
      { data: 16, valid: 1, ready: 1, empty: 1, channel: 3, error: 1 },
    );
    const target = iface(
      { readyLatency: '0', symbolsPerBeat: '1', maxChannel: '3', errorDescriptor: 'decode' },
      { data: 16, valid: 1, ready: 1, channel: 2, error: 2 },
    );

    expect(detectStreamingAdaptations(source, target).map((item) => item.kind)).toEqual([
      'data_format', 'channel', 'error',
    ]);
  });

  it('does not invent adapters without Quartus metadata for both endpoints', () => {
    const graph: QsysGraph = {
      name: 'demo',
      modules: [
        { id: 'source', name: 'source', type: 'ip', disabled: false, parameters: {}, ports: [] },
        { id: 'sink', name: 'sink', type: 'ip', disabled: false, parameters: {}, ports: [] },
      ],
      connections: [{
        id: 'connection-0', source: 'source', sourcePort: 'out', target: 'sink', targetPort: 'in',
        kind: 'avalon_streaming', rawKind: 'avalon_streaming', parameters: {},
      }],
      interfaces: { 'source.out': iface({ readyLatency: '1' }) },
      metadata: { source: 'quartus', label: 'Quartus' },
      warnings: [],
    };

    expect(annotateStreamingAdapters(graph).connections[0]?.adaptations).toBeUndefined();
  });
});
