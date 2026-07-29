// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { ConnectionKind } from '../parser/graph';
import { availableConnectionKinds, isDirectKind, isHubKind } from '../webview/viewMode';

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
