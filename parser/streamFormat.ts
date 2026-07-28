// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysInterface } from './graph';

function parameter(iface: QsysInterface, name: string): string | undefined {
  const normalized = name.toLowerCase().replaceAll('_', '');
  return Object.entries(iface.parameters).find(([candidate]) =>
    candidate.toLowerCase().replaceAll('_', '') === normalized,
  )?.[1];
}

function positiveNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Platform Designer's data-format adapter derives the number of symbols on an
 * elaborated endpoint from the physical data width and dataBitsPerSymbol. Some
 * Intel IP leaves symbolsPerBeat at its default even when the port contains
 * multiple symbols, so the reported property is only a fallback.
 */
export function effectiveSymbolsPerBeat(iface: QsysInterface): number | undefined {
  const dataWidth = iface.ports.find((port) => port.role.toLowerCase() === 'data' && port.width > 0)?.width;
  const bitsPerSymbol = positiveNumber(parameter(iface, 'dataBitsPerSymbol'));
  if (dataWidth !== undefined && bitsPerSymbol !== undefined) {
    const derived = dataWidth / bitsPerSymbol;
    if (Number.isInteger(derived) && derived > 0) return derived;
  }
  return positiveNumber(parameter(iface, 'symbolsPerBeat'));
}
