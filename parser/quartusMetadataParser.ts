// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysGraph, QsysInterface, QsysParameterMetadata } from './graph';
import { classifyConnection, orientPlatformDesignerConnection } from './qsysParser';
import { annotateStreamingAdapters } from './streamAdapters';

const prefix = 'QSYS_VIEWER\t';

function unescapeField(value: string): string {
  return value.replace(/\\([\\tnr])/g, (_match, escaped: string) => {
    if (escaped === 't') return '\t';
    if (escaped === 'n') return '\n';
    if (escaped === 'r') return '\r';
    return '\\';
  });
}

function interfaceKind(graph: QsysGraph, endpoint: string): string {
  const connection = graph.connections.find((candidate) =>
    `${candidate.source}.${candidate.sourcePort}` === endpoint
    || `${candidate.target}.${candidate.targetPort}` === endpoint,
  );
  return connection?.rawKind || 'unknown';
}

export function applyQuartusMetadata(graph: QsysGraph, output: string, executable: string): QsysGraph {
  const interfaces: Record<string, QsysInterface> = {};
  const parameterMetadata = new Map<string, Record<string, QsysParameterMetadata>>();
  const moduleIds = new Set(graph.modules.map((module) => module.id));
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith(prefix)) continue;
    const fields = line.split('\t').slice(1).map(unescapeField);
    const [record, moduleName, interfaceName, recordValue] = fields;
    if (!record || !moduleName || !interfaceName) continue;
    if (record === 'INSTANCE_PARAMETER') {
      if (!moduleIds.has(moduleName)) continue;
      const [, , parameterName, orderText = '', group = ''] = fields;
      const order = Number(orderText);
      if (!parameterName || !Number.isFinite(order)) continue;
      const moduleMetadata = parameterMetadata.get(moduleName) ?? {};
      moduleMetadata[parameterName] = {
        order,
        ...(group.trim() ? { group: group.trim() } : {}),
      };
      parameterMetadata.set(moduleName, moduleMetadata);
      continue;
    }
    const endpoint = `${moduleName}.${interfaceName}`;
    if (!moduleIds.has(moduleName)) continue;
    const iface = interfaces[endpoint] ?? {
      module: moduleName,
      name: interfaceName,
      kind: record === 'INTERFACE' && recordValue ? recordValue : interfaceKind(graph, endpoint),
      parameters: {},
      ports: [],
      source: 'quartus' as const,
    };
    interfaces[endpoint] = iface;
    if (record === 'PARAMETER') {
      const [, , , name, value = ''] = fields;
      if (name) iface.parameters[name] = value;
    } else if (record === 'PORT') {
      const [, , , name, role = '', direction = '', widthText = '0'] = fields;
      if (!name) continue;
      const width = Number(widthText);
      iface.ports.push({
        name,
        role: role.toLowerCase(),
        direction,
        width: Number.isFinite(width) ? width : 0,
      });
    }
  }
  const count = Object.keys(interfaces).length;
  if (count === 0) throw new Error('qsys-script returned no elaborated interfaces. Check the IP search paths.');
  const modules = graph.modules.map((module) => {
    const discovered = parameterMetadata.get(module.id);
    if (!discovered) return module;
    const configured = Object.fromEntries(Object.entries(discovered)
      .filter(([parameter]) => Object.hasOwn(module.parameters, parameter)));
    return Object.keys(configured).length > 0
      ? { ...module, parameterMetadata: configured }
      : module;
  });
  const connections = graph.connections.map((connection) => {
    const sourceEndpoint = `${connection.source}.${connection.sourcePort}`;
    const targetEndpoint = `${connection.target}.${connection.targetPort}`;
    const candidates = [
      interfaces[sourceEndpoint]?.kind,
      interfaces[targetEndpoint]?.kind,
      connection.rawKind,
    ].filter((kind): kind is string => Boolean(kind));
    const rawKind = candidates.find((kind) => classifyConnection(kind) !== 'other')
      ?? candidates[0]
      ?? connection.rawKind;
    const resolved = {
      ...connection,
      kind: classifyConnection(rawKind),
      rawKind,
    };
    return resolved.kind === 'interrupt' && connection.kind !== 'interrupt'
      ? orientPlatformDesignerConnection(resolved)
      : resolved;
  });
  const exportedInterfaceMetadata = Object.fromEntries(Object.entries(graph.exportedInterfaceMetadata ?? {})
    .map(([name, metadata]) => {
      const endpoint = graph.exportedInterfaces?.[name];
      const exactKind = endpoint ? interfaces[endpoint]?.kind : undefined;
      const rawKind = exactKind || metadata.rawKind;
      return [name, { ...metadata, kind: classifyConnection(rawKind), rawKind }];
    }));
  return annotateStreamingAdapters({
    ...graph,
    modules,
    connections,
    interfaces,
    exportedInterfaceMetadata,
    metadata: {
      source: 'quartus',
      label: `Live Quartus metadata (${count} elaborated interfaces).`,
      path: executable,
    },
  });
}
