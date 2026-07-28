// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type {
  QsysAdaptation,
  QsysAdapterDifference,
  QsysGraph,
  QsysInterface,
} from './graph';

function parameter(iface: QsysInterface, name: string): string | undefined {
  const normalized = name.toLowerCase().replaceAll('_', '');
  return Object.entries(iface.parameters).find(([candidate]) =>
    candidate.toLowerCase().replaceAll('_', '') === normalized,
  )?.[1];
}

function portWidth(iface: QsysInterface, role: string): number {
  return iface.ports.find((port) => port.role.toLowerCase() === role)?.width ?? 0;
}

function displayPresence(width: number): string {
  return width > 0 ? 'present' : 'absent';
}

function sameValue(left: string, right: string): boolean {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (left.trim() !== '' && right.trim() !== '' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber === rightNumber;
  }
  return left.trim() === right.trim();
}

function valueDifference(
  property: string,
  source: string | undefined,
  target: string | undefined,
): QsysAdapterDifference | undefined {
  if (source === undefined || target === undefined || sameValue(source, target)) return undefined;
  return { property, source, target };
}

function widthDifference(
  property: string,
  source: number,
  target: number,
): QsysAdapterDifference | undefined {
  return source === target ? undefined : { property, source: String(source), target: String(target) };
}

function presenceDifference(
  property: string,
  sourceWidth: number,
  targetWidth: number,
): QsysAdapterDifference | undefined {
  const source = displayPresence(sourceWidth);
  const target = displayPresence(targetWidth);
  return source === target ? undefined : { property, source, target };
}

function adaptation(
  kind: QsysAdaptation['kind'],
  differences: Array<QsysAdapterDifference | undefined>,
): QsysAdaptation | undefined {
  const present = differences.filter((difference): difference is QsysAdapterDifference => Boolean(difference));
  return present.length > 0 ? { kind, differences: present } : undefined;
}

function errorAdaptation(source: QsysInterface, target: QsysInterface): QsysAdaptation | undefined {
  const sourceWidth = portWidth(source, 'error');
  const targetWidth = portWidth(target, 'error');
  const sourceDescriptor = parameter(source, 'errorDescriptor')?.trim() ?? '';
  const targetDescriptor = parameter(target, 'errorDescriptor')?.trim() ?? '';
  const width = widthDifference('error width', sourceWidth, targetWidth);
  let descriptor = valueDifference('errorDescriptor', sourceDescriptor, targetDescriptor);

  // Matches Intel's adapter exception for an optional descriptor on only one
  // side, unless the sink explicitly maps it to the catch-all "other" value.
  if (!width && descriptor) {
    const onlyOneDescriptor = Boolean(sourceDescriptor) !== Boolean(targetDescriptor);
    const sinkHasOther = targetDescriptor.split(/\s+/).includes('other');
    if (onlyOneDescriptor && !sinkHasOther) descriptor = undefined;
  }
  return adaptation('error', [width, descriptor]);
}

export function detectStreamingAdaptations(
  source: QsysInterface,
  target: QsysInterface,
): QsysAdaptation[] {
  const timing = adaptation('timing', [
    presenceDifference('valid signal', portWidth(source, 'valid'), portWidth(target, 'valid')),
    presenceDifference('ready signal', portWidth(source, 'ready'), portWidth(target, 'ready')),
    valueDifference('readyLatency', parameter(source, 'readyLatency'), parameter(target, 'readyLatency')),
  ]);
  const dataFormat = adaptation('data_format', [
    valueDifference('symbolsPerBeat', parameter(source, 'symbolsPerBeat'), parameter(target, 'symbolsPerBeat')),
    presenceDifference('empty signal', portWidth(source, 'empty'), portWidth(target, 'empty')),
  ]);
  const sourceChannelWidth = portWidth(source, 'channel');
  const targetChannelWidth = portWidth(target, 'channel');
  const channel = sourceChannelWidth === 0 && targetChannelWidth === 0
    ? undefined
    : adaptation('channel', [
      widthDifference('channel width', sourceChannelWidth, targetChannelWidth),
      valueDifference('maxChannel', parameter(source, 'maxChannel'), parameter(target, 'maxChannel')),
    ]);
  const error = errorAdaptation(source, target);
  return [timing, dataFormat, channel, error]
    .filter((item): item is QsysAdaptation => Boolean(item));
}

export function annotateStreamingAdapters(graph: QsysGraph): QsysGraph {
  if (graph.metadata.source !== 'quartus') return graph;
  return {
    ...graph,
    connections: graph.connections.map((connection) => {
      if (connection.kind !== 'avalon_streaming') return connection;
      const source = graph.interfaces[`${connection.source}.${connection.sourcePort}`];
      const target = graph.interfaces[`${connection.target}.${connection.targetPort}`];
      if (!source || !target) return connection;
      const adaptations = detectStreamingAdaptations(source, target);
      return adaptations.length > 0 ? { ...connection, adaptations } : connection;
    }),
  };
}
