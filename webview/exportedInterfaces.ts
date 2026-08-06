// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { ConnectionKind, QsysGraph, QsysInterface } from '../parser/graph';
import { classifyConnection } from '../parser/qsysParser';

export type ExportedInterfaceSide = 'input' | 'output';

export interface ExportedInterface {
  name: string;
  endpoint: string;
  moduleId: string;
  port: string;
  kind: ConnectionKind;
  rawKind: string;
  direction: string;
  side: ExportedInterfaceSide;
}

const inputDirections = new Set(['input', 'receiver', 'sink', 'slave']);
const outputDirections = new Set(['output', 'sender', 'source', 'start', 'master']);
const inputName = /(?:^|[_-])(?:din|in|input|rx|sink|slave)(?:$|[_-]|\d)/i;
const outputName = /(?:^|[_-])(?:dout|out|output|tx|source|master)(?:$|[_-]|\d)/i;

/** Resolves top-level system exports to visible IP endpoints and signal-flow sides. */
export function collectExportedInterfaces(graph: QsysGraph): ExportedInterface[] {
  return Object.entries(graph.exportedInterfaces ?? {}).flatMap(([name, endpoint]) => {
    const { moduleId, port } = splitEndpoint(endpoint);
    if (!moduleId || !port) return [];
    const metadata = graph.exportedInterfaceMetadata?.[name];
    const exactKind = graph.interfaces[endpoint]?.kind;
    const rawKind = exactKind || metadata?.rawKind || 'unknown';
    const direction = metadata?.direction ?? '';
    return [{
      name,
      endpoint,
      moduleId,
      port,
      kind: exactKind ? classifyConnection(exactKind) : metadata?.kind ?? classifyConnection(rawKind),
      rawKind,
      direction,
      side: interfaceSide(graph.interfaces[endpoint], direction, name, port),
    }];
  });
}

function interfaceSide(
  exactInterface: QsysInterface | undefined,
  direction: string,
  externalName: string,
  internalPort: string,
): ExportedInterfaceSide {
  const words = `${exactInterface?.kind ?? ''} ${direction}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((word) => outputDirections.has(word))) return 'output';
  if (words.some((word) => inputDirections.has(word))) return 'input';
  const physicalDirections = new Set(exactInterface?.ports
    .map((port) => port.direction.toLowerCase())
    .filter(Boolean));
  if (physicalDirections.size === 1 && physicalDirections.has('output')) return 'output';
  if (physicalDirections.size === 1 && physicalDirections.has('input')) return 'input';
  if (direction.toLowerCase() === 'end') return 'input';
  const names = `${externalName} ${internalPort}`;
  if (outputName.test(names)) return 'output';
  if (inputName.test(names)) return 'input';
  return 'input';
}

function splitEndpoint(endpoint: string): { moduleId: string; port: string } {
  const separator = endpoint.lastIndexOf('.');
  return separator < 0
    ? { moduleId: endpoint, port: '' }
    : { moduleId: endpoint.slice(0, separator), port: endpoint.slice(separator + 1) };
}
