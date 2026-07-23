// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { QsysModule } from '../parser/graph';
import { streamParameters } from '../parser/streamMetadata';

const module: QsysModule = {
  id: 'adapter', name: 'adapter', type: 'stream_adapter', disabled: false, ports: [],
  parameters: {
    inBitsPerSymbol: '16',
    inSymbolsPerBeat: '2',
    outUsePackets: 'true',
    UNRELATED: 'ignore me',
  },
};

describe('Avalon-ST configured parameters', () => {
  it('shows relevant raw Qsys parameters without inferring interface metadata', () => {
    expect(streamParameters(module)).not.toHaveProperty('UNRELATED');
    expect(streamParameters(module)).toHaveProperty('outUsePackets', 'true');
  });
});
