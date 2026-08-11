// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { QsysConnection } from '../parser/graph';
import { activeConnections, disabledConnections, moduleConnections, visibleConnections } from '../webview/connectionVisibility';

function connection(id: string, source: string, target: string): QsysConnection {
  return {
    id,
    source,
    sourcePort: 'out',
    target,
    targetPort: 'in',
    kind: 'other',
    rawKind: 'unknown',
    parameters: {},
  };
}

describe('view-only connection visibility', () => {
  const connections = [
    connection('first', 'source', 'middle'),
    connection('second', 'middle', 'target'),
    connection('third', 'other', 'target'),
  ];

  it('finds every incoming and outgoing connection of one IP', () => {
    expect(moduleConnections(connections, 'middle').map(({ id }) => id)).toEqual(['first', 'second']);
  });

  it('filters disabled IDs without mutating the source graph', () => {
    const hidden = new Set(['first', 'third']);

    expect(visibleConnections(connections, hidden).map(({ id }) => id)).toEqual(['second']);
    expect(activeConnections(connections, hidden).map(({ id }) => id)).toEqual(['second']);
    expect(disabledConnections(connections, hidden).map(({ id }) => id)).toEqual(['first', 'third']);
    expect(connections).toHaveLength(3);
  });
});
