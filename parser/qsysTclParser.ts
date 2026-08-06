// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysConnection, QsysDiagnostic, QsysGraph, QsysModule, QsysPort } from './graph';
import { platformDesignerSystemCommands } from './platformDesignerCommands';
import { classifyConnection, orientPlatformDesignerConnection } from './qsysParser';
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

interface PendingInstanceParameters {
  values: Record<string, string>;
  firstLine: number;
}

const ignoredCommands = new Set([
  'package',
  'set_project_property',
  'set_interconnect_requirement',
  'save_system',
  'sync_sysinfo_parameters',
]);

const platformDesignerCommand = /^(?:add|create|delete|disable|enable|get|load|remove|save|set|sync)_/;
const parsedCommands = new Set([
  'create_system',
  'add_instance',
  'set_instance_parameter_value',
  'add_interface',
  'add_interface_port',
  'set_interface_property',
  'add_connection',
  'set_connection_parameter_value',
  ...ignoredCommands,
]);
const knownPlatformDesignerCommands = new Set([
  ...platformDesignerSystemCommands,
  ...parsedCommands,
]);

function editDistance(left: string, right: string): number {
  let previous = [...Array(right.length + 1).keys()];
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

function commandSuggestion(command: string): string | undefined {
  if (!platformDesignerCommand.test(command) || knownPlatformDesignerCommands.has(command)) return undefined;
  const candidates = [...knownPlatformDesignerCommands]
    .map((candidate) => ({ candidate, distance: editDistance(command, candidate) }))
    .sort((left, right) => left.distance - right.distance);
  const best = candidates[0];
  return best && best.distance <= Math.max(2, Math.floor(best.candidate.length * 0.25))
    ? best.candidate
    : undefined;
}

function splitEndpoint(endpoint: string): [string, string] {
  const separator = endpoint.lastIndexOf('.');
  return separator < 0
    ? [endpoint, '']
    : [endpoint.slice(0, separator), endpoint.slice(separator + 1)];
}

function hasSubstitution(words: string[]): boolean {
  return words.some((word) => word.includes('$') || word.includes('['));
}

const avalonMmConnectionParameters = new Set([
  'baseaddress',
  'arbitrationpriority',
  'defaultconnection',
]);

function inferredConnectionKind(connection: PendingConnection): string {
  return Object.keys(connection.parameters).some((parameter) =>
    avalonMmConnectionParameters.has(parameter.toLowerCase()))
    ? 'avalon_memory_mapped'
    : '';
}

function addPort(module: QsysModule, interfaceName: string): void {
  if (!interfaceName || module.ports.some((port) => port.interfaceName === interfaceName)) return;
  const port: QsysPort = { name: interfaceName, interfaceName };
  module.ports.push(port);
}

function connectionId(
  connection: PendingConnection,
  duplicateCounts: Map<string, number>,
): string {
  if (connection.name) return connection.name;
  const base = `tcl:${connection.sourceEndpoint}->${connection.targetEndpoint}`;
  const duplicate = duplicateCounts.get(base) ?? 0;
  duplicateCounts.set(base, duplicate + 1);
  return duplicate === 0 ? base : `${base}#${duplicate + 1}`;
}

/**
 * Parses the linear Tcl emitted by Platform Designer's “Export System as
 * Platform Designer script” command. It deliberately does not evaluate Tcl.
 */
export function parseQsysTcl(script: string, fallbackName = 'Qsys system'): QsysGraph {
  const commands = parseTclCommands(script);
  const warnings: string[] = [];
  const diagnostics: QsysDiagnostic[] = [];
  const unsupported = new Set<string>();
  const modules: QsysModule[] = [];
  const moduleByName = new Map<string, QsysModule>();
  const pendingParameters = new Map<string, PendingInstanceParameters>();
  const rawConnections: PendingConnection[] = [];
  const connectionByName = new Map<string, PendingConnection>();
  const declaredInterfaces = new Map<string, DeclaredInterface>();
  let systemName = fallbackName;
  const report = (message: string, line?: number, severity: QsysDiagnostic['severity'] = 'warning') => {
    warnings.push(message);
    diagnostics.push({ severity, message, line });
  };

  for (const command of commands) {
    if (command.name === 'create_system') {
      if (command.words[0] && !hasSubstitution(command.words)) systemName = command.words[0];
      continue;
    }
    if (command.name === 'add_instance') {
      const [name, type] = command.words;
      if (!name || !type || hasSubstitution(command.words)) {
        report(`Skipped dynamic or incomplete add_instance at line ${command.line}.`, command.line);
        continue;
      }
      if (moduleByName.has(name)) {
        report(`Skipped duplicate instance ${name} at line ${command.line}.`, command.line);
        continue;
      }
      const module: QsysModule = {
        id: name,
        name,
        type,
        disabled: false,
        parameters: pendingParameters.get(name)?.values ?? {},
        ports: [],
      };
      modules.push(module);
      moduleByName.set(name, module);
      continue;
    }
    if (command.name === 'set_instance_parameter_value') {
      const [instanceName, parameterName, parameterValue = ''] = command.words;
      if (!instanceName || !parameterName || hasSubstitution([instanceName, parameterName])) {
        report(`Skipped dynamic or incomplete instance parameter at line ${command.line}.`, command.line);
        continue;
      }
      const pending = pendingParameters.get(instanceName);
      const parameters = moduleByName.get(instanceName)?.parameters
        ?? pending?.values
        ?? {};
      parameters[parameterName] = parameterValue;
      if (!moduleByName.has(instanceName)) {
        pendingParameters.set(instanceName, {
          values: parameters,
          firstLine: pending?.firstLine ?? command.line,
        });
      }
      continue;
    }
    if (command.name === 'add_interface') {
      const [name, kind, direction = ''] = command.words;
      if (!name || !kind || hasSubstitution([name, kind, direction])) {
        report(`Skipped dynamic or incomplete add_interface at line ${command.line}.`, command.line);
        continue;
      }
      declaredInterfaces.set(name, { kind, direction });
      continue;
    }
    if (command.name === 'add_interface_port') {
      const [interfaceName] = command.words;
      if (!interfaceName || hasSubstitution([interfaceName])) {
        report(`Skipped dynamic or incomplete add_interface_port at line ${command.line}.`, command.line);
      }
      continue;
    }
    if (command.name === 'set_interface_property') {
      const [interfaceName, property, value = ''] = command.words;
      if (!interfaceName || !property || hasSubstitution([interfaceName, property])) continue;
      if (property.toUpperCase() === 'EXPORT_OF') {
        const declared = declaredInterfaces.get(interfaceName);
        if (declared) declared.exportOf = value;
        else report(`Interface property at line ${command.line} refers to unknown ${interfaceName}.`, command.line);
      }
      continue;
    }
    if (command.name === 'add_connection') {
      const [sourceEndpoint, targetEndpoint, rawKind, name] = command.words;
      if (!sourceEndpoint || !targetEndpoint || hasSubstitution([sourceEndpoint, targetEndpoint])) {
        report(`Skipped dynamic or incomplete connection at line ${command.line}.`, command.line);
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
      else report(`Connection parameters at line ${command.line} refer to unknown ${connectionName}.`, command.line);
      continue;
    }
    if (!ignoredCommands.has(command.name)) {
      const suggestion = commandSuggestion(command.name);
      unsupported.add(command.name);
      diagnostics.push({
        severity: suggestion ? 'error' : 'warning',
        message: suggestion
          ? `Unknown Platform Designer command “${command.name}”. Did you mean “${suggestion}”?`
          : platformDesignerCommand.test(command.name)
            ? `Unsupported Platform Designer command “${command.name}” was ignored by the static viewer.`
            : `Unsupported Tcl command “${command.name}” was ignored by the static viewer.`,
        line: command.line,
        command: command.name,
      });
    }
  }

  const exportedKinds = new Map<string, string>();
  for (const declared of declaredInterfaces.values()) {
    if (declared.exportOf) exportedKinds.set(declared.exportOf, declared.kind);
  }
  const connections: QsysConnection[] = [];
  const duplicateConnectionCounts = new Map<string, number>();
  for (const connection of rawConnections) {
    const [source, sourcePort] = splitEndpoint(connection.sourceEndpoint);
    const [target, targetPort] = splitEndpoint(connection.targetEndpoint);
    const sourceModule = moduleByName.get(source);
    const targetModule = moduleByName.get(target);
    if (!sourceModule || !targetModule) {
      report(
        `Skipped connection ${connection.sourceEndpoint} → ${connection.targetEndpoint} at line ${connection.line}: module not found.`,
        connection.line,
      );
      continue;
    }
    addPort(sourceModule, sourcePort);
    addPort(targetModule, targetPort);
    const rawKind = connection.rawKind
      || exportedKinds.get(connection.sourceEndpoint)
      || exportedKinds.get(connection.targetEndpoint)
      || inferredConnectionKind(connection)
      || '';
    connections.push(orientPlatformDesignerConnection({
      id: connectionId(connection, duplicateConnectionCounts),
      source,
      sourcePort,
      target,
      targetPort,
      kind: classifyConnection(rawKind),
      rawKind: rawKind || 'unknown (static Tcl)',
      parameters: connection.parameters,
    }));
  }

  for (const [instanceName, pending] of pendingParameters) {
    if (!moduleByName.has(instanceName)) {
      report(`Parameters refer to missing instance ${instanceName}.`, pending.firstLine);
    }
  }
  for (const declared of declaredInterfaces.values()) {
    if (!declared.exportOf) continue;
    const [moduleName, interfaceName] = splitEndpoint(declared.exportOf);
    const module = moduleByName.get(moduleName);
    if (module) addPort(module, interfaceName);
  }
  if (unsupported.size > 0) {
    warnings.push(`Unsupported Tcl commands were ignored: ${[...unsupported].sort().join(', ')}.`);
  }
  if (modules.length === 0) report('No instances were found in this Qsys Tcl file.');

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
    diagnostics,
    exportedInterfaces: Object.fromEntries(
      [...declaredInterfaces]
        .filter(([, declared]) => Boolean(declared.exportOf))
        .map(([name, declared]) => [name, declared.exportOf!]),
    ),
    exportedInterfaceMetadata: Object.fromEntries(
      [...declaredInterfaces]
        .filter(([, declared]) => Boolean(declared.exportOf))
        .map(([name, declared]) => [name, {
          kind: classifyConnection(declared.kind),
          rawKind: declared.kind,
          direction: declared.direction,
        }]),
    ),
  };
}
