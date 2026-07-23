// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysModule } from './graph';

export interface MetadataValue {
  value: string;
  source: string;
}

export interface StreamMetadata {
  bitsPerSymbol?: MetadataValue;
  symbolsPerBeat?: MetadataValue;
  dataWidth?: MetadataValue;
  ready?: MetadataValue;
  readyLatency?: MetadataValue;
  packets?: MetadataValue;
  empty?: MetadataValue;
  channel?: MetadataValue;
}

type EndpointDirection = 'source' | 'target';

const relevantPattern = /(?:bits?.*symbol|symbols?.*beat|data.*width|ready.*latency|use.*ready|packet|sop|eop|empty|channel|color.*plane|parallel.*pixel|pixels.*parallel)/i;

export function streamParameters(module: QsysModule): Record<string, string> {
  return Object.fromEntries(
    Object.entries(module.parameters).filter(([name]) => relevantPattern.test(name)),
  );
}

export function inferStreamMetadata(module: QsysModule, direction: EndpointDirection): StreamMetadata {
  const parameters = module.parameters;
  const pick = (...names: string[]): MetadataValue | undefined => {
    for (const name of names) {
      const match = Object.keys(parameters).find((key) => key.toLowerCase() === name.toLowerCase());
      if (match && parameters[match] !== undefined) return { value: parameters[match], source: match };
    }
    return undefined;
  };
  const directional = (input: string[], output: string[], generic: string[]) =>
    pick(...(direction === 'source' ? output : input), ...generic);

  const bitsPerSymbol = directional(
    ['inBitsPerSymbol', 'INPUT_BITS_PER_SYMBOL'],
    ['outBitsPerSymbol', 'OUTPUT_BITS_PER_SYMBOL'],
    ['BITS_PER_SYMBOL', 'BITS_PER_COLOR_PLANE', 'SYMBOL_WIDTH'],
  );
  let symbolsPerBeat = directional(
    ['inSymbolsPerBeat', 'INPUT_SYMBOLS_PER_BEAT'],
    ['outSymbolsPerBeat', 'OUTPUT_SYMBOLS_PER_BEAT'],
    ['SYMBOLS_PER_BEAT'],
  );
  if (!symbolsPerBeat) {
    const planes = directional(
      ['NUMBER_OF_COLOR_PLANES_IN'],
      ['NUMBER_OF_COLOR_PLANES_OUT'],
      ['NUMBER_OF_COLOR_PLANES', 'COLOR_PLANES'],
    );
    const pixels = directional(
      ['PIXELS_IN_PARALLEL_IN'],
      ['PIXELS_IN_PARALLEL_OUT'],
      ['PIXELS_IN_PARALLEL', 'PARALLEL_PIXELS'],
    );
    const parallelPlanes = pick('COLOR_PLANES_ARE_IN_PARALLEL');
    if (planes && pixels && parallelPlanes && !['0', 'false'].includes(parallelPlanes.value.toLowerCase())) {
      const product = Number(planes.value) * Number(pixels.value);
      if (Number.isFinite(product)) {
        symbolsPerBeat = { value: String(product), source: `${planes.source} × ${pixels.source}` };
      }
    }
  }
  let dataWidth = directional(
    ['inDataWidth', 'INPUT_DATA_WIDTH'],
    ['outDataWidth', 'OUTPUT_DATA_WIDTH'],
    ['DATA_WIDTH'],
  );
  if (!dataWidth && bitsPerSymbol && symbolsPerBeat) {
    const product = Number(bitsPerSymbol.value) * Number(symbolsPerBeat.value);
    if (Number.isFinite(product)) {
      dataWidth = { value: String(product), source: `${bitsPerSymbol.source} × ${symbolsPerBeat.source}` };
    }
  }
  return {
    bitsPerSymbol,
    symbolsPerBeat,
    dataWidth,
    ready: directional(
      ['inUseReady', 'INPUT_USE_READY'],
      ['outUseReady', 'OUTPUT_USE_READY'],
      ['USE_READY'],
    ),
    readyLatency: directional(
      ['inReadyLatency', 'INPUT_READY_LATENCY'],
      ['outReadyLatency', 'OUTPUT_READY_LATENCY'],
      ['READY_LATENCY'],
    ),
    packets: directional(
      ['inUsePackets', 'INPUT_USE_PACKETS'],
      ['outUsePackets', 'OUTPUT_USE_PACKETS'],
      ['USE_PACKETS', 'USER_PACKET_SUPPORT', 'GENERATE_USER0_PACKET'],
    ),
    empty: directional(
      ['inUseEmpty', 'INPUT_USE_EMPTY'],
      ['outUseEmpty', 'OUTPUT_USE_EMPTY'],
      ['USE_EMPTY', 'USE_EMPTY_PORT'],
    ),
    channel: directional(
      ['inChannelWidth', 'INPUT_CHANNEL_WIDTH'],
      ['outChannelWidth', 'OUTPUT_CHANNEL_WIDTH'],
      ['CHANNEL_WIDTH', 'USE_CHANNEL', 'NO_OF_CHANNELS'],
    ),
  };
}
