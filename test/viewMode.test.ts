// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { ConnectionKind } from '../parser/graph';
import { isDirectKind, isHubKind } from '../webview/viewMode';

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
  it('keeps the existing pipeline edges and high-fanout hubs', () => {
    expect(kinds.filter((kind) => isDirectKind(kind, 'pipeline'))).toEqual([
      'avalon_streaming', 'conduit', 'other',
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
});
