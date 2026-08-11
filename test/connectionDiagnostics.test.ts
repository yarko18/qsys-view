// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { ConnectionKind, QsysConnection } from '../parser/graph';
import { connectionDiagnostics } from '../webview/connectionDiagnostics';

function connection(id: string, source: string, targetPort: string, kind: ConnectionKind): QsysConnection {
  return {
    id,
    source,
    sourcePort: 'dout',
    target: 'sink',
    targetPort,
    kind,
    rawKind: kind,
    parameters: {},
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
});
