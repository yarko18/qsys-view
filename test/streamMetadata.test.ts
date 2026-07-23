// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { QsysModule } from '../parser/graph';
import { inferStreamMetadata, streamParameters } from '../parser/streamMetadata';

const module: QsysModule = {
  id: 'adapter', name: 'adapter', type: 'stream_adapter', disabled: false, ports: [],
  parameters: {
    inBitsPerSymbol: '16',
    inSymbolsPerBeat: '2',
    inReadyLatency: '1',
    inUseReady: 'true',
    outReadyLatency: '0',
    outUsePackets: 'true',
    UNRELATED: 'ignore me',
  },
};

describe('Avalon-ST metadata inference', () => {
  it('uses endpoint-specific parameters and derives data width', () => {
    const input = inferStreamMetadata(module, 'target');
    expect(input.bitsPerSymbol?.value).toBe('16');
    expect(input.symbolsPerBeat?.value).toBe('2');
    expect(input.dataWidth?.value).toBe('32');
    expect(input.readyLatency?.value).toBe('1');
    expect(input.ready?.value).toBe('true');
    expect(inferStreamMetadata(module, 'source').readyLatency?.value).toBe('0');
  });

  it('selects only stream-related raw parameters', () => {
    expect(streamParameters(module)).not.toHaveProperty('UNRELATED');
    expect(streamParameters(module)).toHaveProperty('outUsePackets', 'true');
  });
});
