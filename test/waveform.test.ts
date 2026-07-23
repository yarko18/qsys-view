// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { QsysInterface, QsysInterfacePort } from '../parser/graph';
import { createInterfaceWaveform } from '../parser/waveform';

function iface(parameters: Record<string, string>, ports: Array<[string, number]>): QsysInterface {
  return {
    module: 'ip', name: 'stream', kind: 'avalon_streaming_source', source: 'quartus', parameters,
    ports: ports.map(([role, width]): QsysInterfacePort => ({ name: role, role, width, direction: 'Output' })),
  };
}

describe('elaborated Avalon-ST waveform', () => {
  it('uses exact ports, symbols per beat, widths and ready latency', () => {
    const waveform = createInterfaceWaveform(iface({
      dataBitsPerSymbol: '8', symbolsPerBeat: '2', readyLatency: '1',
    }, [
      ['ready', 1], ['valid', 1], ['startofpacket', 1], ['endofpacket', 1],
      ['channel', 2], ['data', 16], ['empty', 1], ['error', 3],
    ]), iface({}, []));
    expect(waveform.transferCycles).toEqual([1, 2]);
    expect(waveform.cycles).toBe(4);
    expect(waveform.signals.find((signal) => signal.name === 'ready')?.values).toEqual(['1', '1', '0', '0']);
    expect(waveform.signals.find((signal) => signal.name === 'valid')?.values).toEqual(['0', '1', '1', '0']);
    expect(waveform.signals.map((signal) => signal.name)).toEqual([
      'ready', 'valid', 'sop', 'eop', 'channel', 'data', 'data', 'empty', 'error',
    ]);
    expect(waveform.signals.filter((signal) => signal.name === 'data').map((signal) => signal.label)).toEqual([
      'data[7:0] · symbol 1', 'data[15:8] · symbol 2',
    ]);
    expect(waveform.signals.filter((signal) => signal.name === 'data').map((signal) => signal.values[1])).toEqual(['beat 1', 'beat 1']);
  });

  it('does not draw signals absent from the elaborated port list', () => {
    const waveform = createInterfaceWaveform(iface({ symbolsPerBeat: '1' }, [['valid', 1], ['data', 16]]), iface({}, []));
    expect(waveform.signals.map((signal) => signal.name)).toEqual(['valid', 'data']);
    expect(waveform.signals[1]?.label).toBe('data[15:0]');
  });

  it('uses a compact two-beat example at ready latency zero', () => {
    const waveform = createInterfaceWaveform(iface({ readyLatency: '0', symbolsPerBeat: '1' }, [
      ['ready', 1], ['valid', 1], ['startofpacket', 1], ['endofpacket', 1], ['data', 8],
    ]), iface({}, []));
    expect(waveform.transferCycles).toEqual([1, 2]);
    expect(waveform.cycles).toBe(4);
    expect(waveform.signals.find((signal) => signal.name === 'valid')?.values).toEqual(['0', '1', '1', '0']);
    expect(waveform.signals.find((signal) => signal.name === 'sop')?.values).toEqual(['0', '1', '0', '0']);
    expect(waveform.signals.find((signal) => signal.name === 'eop')?.values).toEqual(['0', '0', '1', '0']);
    expect(waveform.signals.find((signal) => signal.name === 'data')?.values).toEqual(['—', 'beat 1', 'beat 2', '—']);
  });
});
