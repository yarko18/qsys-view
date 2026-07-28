// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysInterface, QsysInterfacePort } from './graph';
import { effectiveSymbolsPerBeat } from './streamFormat';

export type WaveformSignalName = 'ready' | 'valid' | 'sop' | 'eop' | 'channel' | 'data' | 'empty' | 'error';

export interface WaveformSignal {
  name: WaveformSignalName;
  label: string;
  kind: 'digital' | 'bus';
  values: string[];
  width: number;
  lane?: number;
}

export interface StreamWaveform {
  cycles: number;
  readyLatency: number;
  transferCycles: number[];
  signals: WaveformSignal[];
  bitsPerSymbol: number;
  symbolsPerBeat: number;
  dataWidth: number;
}

function parameter(source: QsysInterface, target: QsysInterface, name: string): string | undefined {
  return source.parameters[name] ?? target.parameters[name];
}

function numeric(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function port(source: QsysInterface, target: QsysInterface, role: string): QsysInterfacePort | undefined {
  return source.ports.find((item) => item.role === role && item.width > 0)
    ?? target.ports.find((item) => item.role === role && item.width > 0);
}

export function createInterfaceWaveform(source: QsysInterface, target: QsysInterface): StreamWaveform {
  const dataPort = port(source, target, 'data');
  const symbolsPerBeat = effectiveSymbolsPerBeat(source) ?? effectiveSymbolsPerBeat(target) ?? 1;
  const bitsPerSymbol = Math.max(1, Math.floor(numeric(
    parameter(source, target, 'dataBitsPerSymbol'),
    dataPort ? Math.max(1, Math.floor(dataPort.width / symbolsPerBeat)) : 1,
  )));
  const dataWidth = dataPort?.width ?? bitsPerSymbol * symbolsPerBeat;
  const readyPort = port(source, target, 'ready');
  const readyLatency = readyPort
    ? Math.floor(numeric(parameter(source, target, 'readyLatency'), 0))
    : 0;
  const firstReady = readyPort && readyLatency > 0 ? 0 : 1;
  const secondReady = firstReady + 1;
  const firstTransfer = readyPort ? firstReady + readyLatency : 1;
  const secondTransfer = readyPort ? secondReady + readyLatency : 2;
  const cycles = secondTransfer + 2;
  const transferCycles = [firstTransfer, secondTransfer];
  const beatAtCycle = Array.from({ length: cycles }, (): number | undefined => undefined);
  beatAtCycle[firstTransfer] = 0;
  beatAtCycle[secondTransfer] = 1;
  const active = beatAtCycle.map((beat) => beat !== undefined);
  const packetMarker = (beat: number) => beatAtCycle.map((value) => value === beat ? '1' : '0');
  const signals: WaveformSignal[] = [];

  if (readyPort) {
    const values = Array.from({ length: cycles }, () => '0');
    values[firstReady] = '1';
    values[secondReady] = '1';
    signals.push({ name: 'ready', label: 'ready', kind: 'digital', width: readyPort.width, values });
  }
  const validPort = port(source, target, 'valid');
  if (validPort) {
    signals.push({ name: 'valid', label: 'valid', kind: 'digital', width: validPort.width, values: active.map((on) => on ? '1' : '0') });
  }
  const sopPort = port(source, target, 'startofpacket');
  if (sopPort) signals.push({ name: 'sop', label: 'sop', kind: 'digital', width: sopPort.width, values: packetMarker(0) });
  const eopPort = port(source, target, 'endofpacket');
  if (eopPort) signals.push({ name: 'eop', label: 'eop', kind: 'digital', width: eopPort.width, values: packetMarker(1) });
  const channelPort = port(source, target, 'channel');
  if (channelPort) {
    signals.push({ name: 'channel', label: rangeLabel('channel', channelPort.width), kind: 'bus', width: channelPort.width, values: active.map((on) => on ? '0' : '—') });
  }
  if (dataPort) {
    for (let lane = 0; lane < symbolsPerBeat; lane++) {
      const low = lane * bitsPerSymbol;
      const high = Math.min(dataWidth - 1, low + bitsPerSymbol - 1);
      signals.push({
        name: 'data',
        label: symbolsPerBeat === 1
          ? rangeLabel('data', dataWidth)
          : `data[${high}:${low}] · symbol ${lane + 1}`,
        kind: 'bus',
        width: bitsPerSymbol,
        lane,
        values: beatAtCycle.map((beat) => {
          if (beat === undefined) return '—';
          return `beat ${beat + 1}`;
        }),
      });
    }
  }
  const emptyPort = port(source, target, 'empty');
  if (emptyPort) {
    signals.push({ name: 'empty', label: rangeLabel('empty', emptyPort.width), kind: 'bus', width: emptyPort.width, values: active.map((on) => on ? '0' : '—') });
  }
  const errorPort = port(source, target, 'error');
  if (errorPort) {
    signals.push({ name: 'error', label: rangeLabel('error', errorPort.width), kind: 'bus', width: errorPort.width, values: active.map((on) => on ? '0' : '—') });
  }
  return { cycles, readyLatency, transferCycles, signals, bitsPerSymbol, symbolsPerBeat, dataWidth };
}

function rangeLabel(name: string, width: number): string {
  return width <= 1 ? name : `${name}[${width - 1}:0]`;
}
