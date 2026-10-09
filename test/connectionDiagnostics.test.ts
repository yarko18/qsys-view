// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { ConnectionKind, QsysConnection } from '../parser/graph';
import { connectionDiagnostics } from '../webview/connectionDiagnostics';

function connection(
  id: string,
  source: string,
  targetPort: string,
  kind: ConnectionKind,
  parameters: Record<string, string> = {},
): QsysConnection {
  return {
    id,
    source,
    sourcePort: 'dout',
    target: 'sink',
    targetPort,
    kind,
    rawKind: kind,
    parameters,
  };
}

describe('connection diagnostics', () => {
  it('reports multiple Avalon-ST sources connected to one sink', () => {
    const diagnostics = connectionDiagnostics([
      connection('first', 'source_0', 'din', 'avalon_streaming'),
      connection('second', 'source_1', 'din', 'avalon_streaming'),
    ]);

    expect(diagnostics).toEqual([{
      severity: 'error',
      message: 'Avalon-ST sink sink.din has 2 incoming connections (source_0.dout, source_1.dout). Avalon-ST must be point-to-point.',
    }]);
  });

  it('accepts P2P Avalon-ST and does not apply the rule to other interfaces', () => {
    expect(connectionDiagnostics([
      connection('stream-0', 'source_0', 'din_0', 'avalon_streaming'),
      connection('stream-1', 'source_1', 'din_1', 'avalon_streaming'),
      connection('unknown-0', 'source_0', 'shared', 'other'),
      connection('unknown-1', 'source_1', 'shared', 'other'),
    ])).toEqual([]);
  });

  it('reports one Avalon-ST source connected to multiple sinks', () => {
    const first = connection('first', 'source', 'din', 'avalon_streaming');
    const second = {
      ...connection('second', 'source', 'din', 'avalon_streaming'),
      target: 'other_sink',
    };

    expect(connectionDiagnostics([first, second])).toEqual([{
      severity: 'error',
      message: 'Avalon-ST source source.dout has 2 outgoing connections (sink.din, other_sink.din). Avalon-ST must be point-to-point.',
    }]);
  });

  it('reports Avalon-MM slaves with equivalent base addresses on one master', () => {
    const first = {
      ...connection('first', 'cpu', 'control', 'avalon_memory_mapped', { baseAddress: '0x00000100' }),
      sourcePort: 'data_master',
      target: 'timer_2',
    };
    const second = {
      ...connection('second', 'cpu', 'control', 'avalon_memory_mapped', { BASE_ADDRESS: '256' }),
      sourcePort: 'data_master',
      target: 'timer_10',
    };

    expect(connectionDiagnostics([second, first])).toEqual([{
      severity: 'warning',
      message: 'Avalon-MM master cpu.data_master maps timer_2.control and timer_10.control to the same base address 0x100.',
    }]);
  });

  it('keeps Avalon-MM address spaces independent per master', () => {
    const first = {
      ...connection('first', 'cpu_0', 'control', 'avalon_memory_mapped', { baseAddress: '0x100' }),
      sourcePort: 'data_master',
      target: 'timer_0',
    };
    const second = {
      ...first,
      id: 'second',
      source: 'cpu_1',
      target: 'timer_1',
    };

    expect(connectionDiagnostics([first, second])).toEqual([]);
  });

  it('ignores dynamic addresses and non-Avalon-MM connections', () => {
    const dynamic = connection(
      'dynamic',
      'cpu',
      'control_0',
      'avalon_memory_mapped',
      { baseAddress: '$timer_base' },
    );
    const unrelated = connection(
      'unrelated',
      'cpu',
      'control_1',
      'other',
      { baseAddress: '0x100' },
    );
    const valid = connection(
      'valid',
      'cpu',
      'control_2',
      'avalon_memory_mapped',
      { baseAddress: '0x100' },
    );

    expect(connectionDiagnostics([dynamic, unrelated, valid])).toEqual([]);
  });
});
