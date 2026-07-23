// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { XMLParser } from 'fast-xml-parser';
import type { ConnectionKind, QsysConnection, QsysGraph, QsysModule, QsysPort } from './graph';

type XmlNode = Record<string, unknown>;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

function arrayOf(value: unknown): XmlNode[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).filter(
    (item): item is XmlNode => typeof item === 'object' && item !== null,
  );
}

function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return text((value as XmlNode)['#text']);
  return String(value);
}

function truthy(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(text(value).toLowerCase());
}

function collectParameters(node: XmlNode): Record<string, string> {
  const parameters: Record<string, string> = {};
  const candidates = [
    ...arrayOf(node.parameter),
    ...arrayOf((node.parameters as XmlNode | undefined)?.parameter),
  ];
  for (const parameter of candidates) {
    const name = text(parameter.name);
    if (!name) continue;
    parameters[name] = text(parameter.value ?? parameter.defaultValue ?? parameter['#text']);
  }
  return parameters;
}

function collectInterfaces(module: XmlNode): { ports: QsysPort[]; kinds: Map<string, string> } {
  const ports: QsysPort[] = [];
  const kinds = new Map<string, string>();
  const interfaces = [
    ...arrayOf(module.interface),
    ...arrayOf((module.interfaces as XmlNode | undefined)?.interface),
  ];

  for (const iface of interfaces) {
    const interfaceName = text(iface.name);
    if (!interfaceName) continue;
    kinds.set(interfaceName, text(iface.kind ?? iface.type));
    const interfacePorts = [
      ...arrayOf(iface.port),
      ...arrayOf((iface.ports as XmlNode | undefined)?.port),
    ];
    if (interfacePorts.length === 0) {
      ports.push({ name: interfaceName, interfaceName });
    } else {
      for (const port of interfacePorts) {
        ports.push({
          name: text(port.name) || interfaceName,
          interfaceName,
          direction: text(port.direction) || undefined,
          role: text(port.role) || undefined,
        });
      }
    }
  }
  return { ports, kinds };
}

function splitEndpoint(endpoint: string): [string, string] {
  const separator = endpoint.lastIndexOf('.');
  return separator < 0
    ? [endpoint, '']
    : [endpoint.slice(0, separator), endpoint.slice(separator + 1)];
}

export function classifyConnection(rawKind: string): ConnectionKind {
  const kind = rawKind.toLowerCase().replaceAll('-', '_');
  if (/stream|avalon_st|asi|aso/.test(kind)) return 'avalon_streaming';
  if (/memory|avalon_mm|avalon_master|avalon_slave/.test(kind)) return 'avalon_memory_mapped';
  if (/clock|clk/.test(kind)) return 'clock';
  if (/reset|rst/.test(kind)) return 'reset';
  if (/interrupt|irq/.test(kind)) return 'interrupt';
  if (/conduit|export|wire/.test(kind)) return 'conduit';
  if (kind === 'avalon') return 'avalon_memory_mapped';
  return 'other';
}

function findSystem(document: XmlNode): XmlNode {
  for (const key of ['system', 'component', 'qsys']) {
    const value = document[key];
    if (typeof value === 'object' && value !== null) return value as XmlNode;
  }
  return document;
}

export function parseQsys(xml: string, fallbackName = 'Qsys system'): QsysGraph {
  const warnings: string[] = [];
  let document: XmlNode;
  try {
    document = xmlParser.parse(xml) as XmlNode;
  } catch (error) {
    throw new Error(`Invalid Qsys XML: ${error instanceof Error ? error.message : String(error)}`);
  }

  const system = findSystem(document);
  const rawModules = [
    ...arrayOf(system.module),
    ...arrayOf((system.modules as XmlNode | undefined)?.module),
    ...arrayOf(system.instance),
    ...arrayOf((system.instances as XmlNode | undefined)?.instance),
  ];
  const interfaceKinds = new Map<string, string>();
  const modules: QsysModule[] = [];
  const seenModules = new Set<string>();

  for (const rawModule of rawModules) {
    const name = text(rawModule.name ?? rawModule.instanceName);
    if (!name || seenModules.has(name)) continue;
    seenModules.add(name);
    const parameters = collectParameters(rawModule);
    const { ports, kinds } = collectInterfaces(rawModule);
    for (const [interfaceName, kind] of kinds) interfaceKinds.set(`${name}.${interfaceName}`, kind);
    const enabled = text(rawModule.enabled).toLowerCase();
    const disabled = truthy(rawModule.disabled)
      || ['0', 'false', 'no', 'off'].includes(enabled)
      || text(parameters.ENABLED).toLowerCase() === 'false';
    modules.push({
      id: name,
      name,
      type: text(rawModule.kind ?? rawModule.type ?? rawModule.class) || 'unknown',
      disabled,
      parameters,
      ports,
    });
  }

  const rawConnections = [
    ...arrayOf(system.connection),
    ...arrayOf((system.connections as XmlNode | undefined)?.connection),
  ];
  const connections: QsysConnection[] = [];
  for (const [index, connection] of rawConnections.entries()) {
    const sourceEndpoint = text(connection.start ?? connection.source ?? connection.from);
    const targetEndpoint = text(connection.end ?? connection.target ?? connection.to);
    if (!sourceEndpoint || !targetEndpoint) {
      warnings.push(`Skipped connection ${index + 1}: missing start or end endpoint.`);
      continue;
    }
    const [source, sourcePort] = splitEndpoint(sourceEndpoint);
    const [target, targetPort] = splitEndpoint(targetEndpoint);
    if (!seenModules.has(source) || !seenModules.has(target)) {
      warnings.push(`Skipped connection ${sourceEndpoint} → ${targetEndpoint}: module not found.`);
      continue;
    }
    const declaredKind = text(connection.kind ?? connection.type);
    const rawKind = declaredKind
      || interfaceKinds.get(sourceEndpoint)
      || interfaceKinds.get(targetEndpoint)
      || '';
    connections.push({
      id: text(connection.name) || `connection-${index}`,
      source,
      sourcePort,
      target,
      targetPort,
      kind: classifyConnection(rawKind),
      rawKind: rawKind || 'unknown',
      parameters: collectParameters(connection),
    });
  }

  if (modules.length === 0) warnings.push('No modules were found in this Qsys file.');
  const systemName = text(system.name);
  return {
    name: !systemName || /\$\$\{FILENAME\}/i.test(systemName) ? fallbackName : systemName,
    modules,
    connections,
    interfaces: {},
    metadata: {
      source: 'qsys-only',
      label: 'Exact interface metadata is not loaded. Run qsys-script from the viewer; values are never guessed.',
    },
    warnings,
  };
}
