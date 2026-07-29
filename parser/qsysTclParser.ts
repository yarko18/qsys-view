// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysConnection, QsysGraph, QsysModule, QsysPort } from './graph';
import { classifyConnection } from './qsysParser';
import { parseTclCommands } from './tclCommands';
interface PendingConnection {
  sourceEndpoint: string;
  targetEndpoint: string;
  line: number;
  parameters: Record<string, string>;
  rawKind?: string;
  name?: string;
}

interface DeclaredInterface {
  kind: string;
  direction: string;
  exportOf?: string;
}

const ignoredCommands = new Set([
  'package',
  'set_project_property',
  'set_interconnect_requirement',
  'save_system',
  'sync_sysinfo_parameters',
]);

function splitEndpoint(endpoint: string): [string, string] {
  const separator = endpoint.lastIndexOf('.');
  return separator < 0
    ? [endpoint, '']
    : [endpoint.slice(0, separator), endpoint.slice(separator + 1)];
}

function hasSubstitution(words: string[]): boolean {
  return words.some((word) => word.includes('$') || word.includes('['));
}

function addPort(module: QsysModule, interfaceName: string): void {
  if (!interfaceName || module.ports.some((port) => port.interfaceName === interfaceName)) return;
  const port: QsysPort = { name: interfaceName, interfaceName };
  module.ports.push(port);
}

/**
 * Parses the linear Tcl emitted by Platform Designer's “Export System as
 * Platform Designer script” command. It deliberately does not evaluate Tcl.
 */
export function parseQsysTcl(script: string, fallbackName = 'Qsys system'): QsysGraph {
  const commands = parseTclCommands(script);
  const warnings: string[] = [];
  const unsupported = new Set<string>();
  const modules: QsysModule[] = [];
  const moduleByName = new Map<string, QsysModule>();
  const pendingParameters = new Map<string, Record<string, string>>();
  const rawConnections: PendingConnection[] = [];
  const connectionByName = new Map<string, PendingConnection>();
  const declaredInterfaces = new Map<string, DeclaredInterface>();
  let systemName = fallbackName;

  for (const command of commands) {
    if (command.name === 'create_system') {
      if (command.words[0] && !hasSubstitution(command.words)) systemName = command.words[0];
      continue;
    }
    if (command.name === 'add_instance') {
      const [name, type] = command.words;
      if (!name || !type || hasSubstitution(command.words)) {
        warnings.push(`Skipped dynamic or incomplete add_instance at line ${command.line}.`);
        continue;
      }
      if (moduleByName.has(name)) {
        warnings.push(`Skipped duplicate instance ${name} at line ${command.line}.`);
        continue;
      }
      const module: QsysModule = {
        id: name,
        name,
        type,
        disabled: false,
        parameters: pendingParameters.get(name) ?? {},
        ports: [],
      };
      modules.push(module);
      moduleByName.set(name, module);
      continue;
    }
    if (command.name === 'set_instance_parameter_value') {
      const [instanceName, parameterName, parameterValue = ''] = command.words;
      if (!instanceName || !parameterName || hasSubstitution([instanceName, parameterName])) {
        warnings.push(`Skipped dynamic or incomplete instance parameter at line ${command.line}.`);
        continue;
      }
      const parameters = moduleByName.get(instanceName)?.parameters
        ?? pendingParameters.get(instanceName)
        ?? {};
      parameters[parameterName] = parameterValue;
      if (!moduleByName.has(instanceName)) pendingParameters.set(instanceName, parameters);
      continue;
    }
    if (command.name === 'add_interface') {
      const [name, kind, direction = ''] = command.words;
      if (!name || !kind || hasSubstitution([name, kind, direction])) {
        warnings.push(`Skipped dynamic or incomplete add_interface at line ${command.line}.`);
        continue;
      }
      declaredInterfaces.set(name, { kind, direction });
      continue;
    }
    if (command.name === 'add_interface_port') {
      const [interfaceName] = command.words;
      if (!interfaceName || hasSubstitution([interfaceName])) {
        warnings.push(`Skipped dynamic or incomplete add_interface_port at line ${command.line}.`);
      }
      continue;
    }
    if (command.name === 'set_interface_property') {
      const [interfaceName, property, value = ''] = command.words;
      if (!interfaceName || !property || hasSubstitution([interfaceName, property])) continue;
      if (property.toUpperCase() === 'EXPORT_OF') {
        const declared = declaredInterfaces.get(interfaceName);
        if (declared) declared.exportOf = value;
        else warnings.push(`Interface property at line ${command.line} refers to unknown ${interfaceName}.`);
      }
      continue;
    }
    if (command.name === 'add_connection') {
      const [sourceEndpoint, targetEndpoint, rawKind, name] = command.words;
      if (!sourceEndpoint || !targetEndpoint || hasSubstitution([sourceEndpoint, targetEndpoint])) {
        warnings.push(`Skipped dynamic or incomplete connection at line ${command.line}.`);
        continue;
      }
      const connection: PendingConnection = {
        sourceEndpoint,
        targetEndpoint,
        line: command.line,
        parameters: {},
        rawKind: rawKind && !hasSubstitution([rawKind]) ? rawKind : undefined,
        name: name && !hasSubstitution([name]) ? name : undefined,
      };
      rawConnections.push(connection);
      connectionByName.set(`${sourceEndpoint}/${targetEndpoint}`, connection);
      continue;
    }
    if (command.name === 'set_connection_parameter_value') {
      const [connectionName, parameterName, parameterValue = ''] = command.words;
      if (!connectionName || !parameterName) continue;
      const connection = connectionByName.get(connectionName);
      if (connection) connection.parameters[parameterName] = parameterValue;
      else warnings.push(`Connection parameters at line ${command.line} refer to unknown ${connectionName}.`);
      continue;
    }
    if (!ignoredCommands.has(command.name)) unsupported.add(command.name);
  }

  const exportedKinds = new Map<string, string>();
  for (const declared of declaredInterfaces.values()) {
    if (declared.exportOf) exportedKinds.set(declared.exportOf, declared.kind);
  }
  const connections: QsysConnection[] = [];
  for (const connection of rawConnections) {
    const [source, sourcePort] = splitEndpoint(connection.sourceEndpoint);
    const [target, targetPort] = splitEndpoint(connection.targetEndpoint);
    const sourceModule = moduleByName.get(source);
    const targetModule = moduleByName.get(target);
    if (!sourceModule || !targetModule) {
      warnings.push(`Skipped connection ${connection.sourceEndpoint} → ${connection.targetEndpoint} at line ${connection.line}: module not found.`);
      continue;
    }
    addPort(sourceModule, sourcePort);
    addPort(targetModule, targetPort);
    const rawKind = connection.rawKind
      || exportedKinds.get(connection.sourceEndpoint)
      || exportedKinds.get(connection.targetEndpoint)
      || '';
    connections.push({
      id: connection.name || `connection-${connections.length}`,
      source,
      sourcePort,
      target,
      targetPort,
      kind: classifyConnection(rawKind),
      rawKind: rawKind || 'unknown (static Tcl)',
      parameters: connection.parameters,
    });
  }

  for (const instanceName of pendingParameters.keys()) {
    if (!moduleByName.has(instanceName)) warnings.push(`Parameters refer to missing instance ${instanceName}.`);
  }
  if (unsupported.size > 0) {
    warnings.push(`Unsupported Tcl commands were ignored: ${[...unsupported].sort().join(', ')}.`);
  }
  if (modules.length === 0) warnings.push('No instances were found in this Qsys Tcl file.');

  return {
    name: systemName,
    modules,
    connections,
    interfaces: {},
    metadata: {
      source: 'qsys-only',
      label: 'Static Qsys Tcl view. Connections without an explicit kind remain unknown until qsys-script runs.',
    },
    warnings,
  };
}
