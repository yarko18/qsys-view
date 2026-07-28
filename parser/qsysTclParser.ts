// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysConnection, QsysGraph, QsysModule, QsysPort } from './graph';

interface TclCommand {
  name: string;
  words: string[];
  line: number;
}
interface PendingConnection {
  sourceEndpoint: string;
  targetEndpoint: string;
  line: number;
  parameters: Record<string, string>;
}

const ignoredCommands = new Set([
  'package',
  'set_project_property',
  'add_interface',
  'set_interface_property',
  'set_interconnect_requirement',
  'save_system',
  'sync_sysinfo_parameters',
]);

function splitCommands(script: string): Array<{ text: string; line: number }> {
  const commands: Array<{ text: string; line: number }> = [];
  let current = '';
  let line = 1;
  let commandLine = 1;
  let braceDepth = 0;
  let bracketDepth = 0;
  let quoted = false;
  let escaped = false;
  let comment = false;
  let hasContent = false;

  const finish = () => {
    const text = current.trim();
    if (text) commands.push({ text, line: commandLine });
    current = '';
    hasContent = false;
    comment = false;
  };

  for (let index = 0; index < script.length; index++) {
    const character = script[index]!;
    if (comment) {
      if (character === '\n') {
        finish();
        line++;
        commandLine = line;
      }
      continue;
    }
    if (!hasContent && character === '#') {
      comment = true;
      continue;
    }
    if (escaped) {
      current += character;
      escaped = false;
      if (character === '\n') line++;
      continue;
    }
    if (character === '\\') {
      current += character;
      escaped = true;
      hasContent = true;
      continue;
    }
    if (character === '"' && braceDepth === 0) quoted = !quoted;
    if (!quoted) {
      if (character === '{') braceDepth++;
      else if (character === '}' && braceDepth > 0) braceDepth--;
      else if (braceDepth === 0 && character === '[') bracketDepth++;
      else if (braceDepth === 0 && character === ']' && bracketDepth > 0) bracketDepth--;
    }
    const separator = !quoted && braceDepth === 0 && bracketDepth === 0
      && (character === '\n' || character === ';');
    if (separator) {
      finish();
      if (character === '\n') line++;
      commandLine = line;
      continue;
    }
    current += character;
    if (!/\s/.test(character)) {
      if (!hasContent) commandLine = line;
      hasContent = true;
    }
    if (character === '\n') line++;
  }
  finish();
  return commands;
}

function decodeEscapes(value: string): string {
  return value.replace(/\\([\\nrt" ])/g, (_match, escaped: string) => {
    if (escaped === 'n') return '\n';
    if (escaped === 'r') return '\r';
    if (escaped === 't') return '\t';
    return escaped;
  });
}

function tokenize(command: { text: string; line: number }): TclCommand | undefined {
  const words: string[] = [];
  const value = command.text;
  let index = 0;
  while (index < value.length) {
    while (/\s/.test(value[index] ?? '')) index++;
    if (index >= value.length) break;
    const start = value[index];
    if (start === '{') {
      let depth = 1;
      let word = '';
      index++;
      while (index < value.length && depth > 0) {
        const character = value[index]!;
        const next = value[index + 1];
        if (character === '\\' && next !== undefined) {
          word += character + next;
          index += 2;
          continue;
        }
        if (character === '{') depth++;
        if (character === '}') depth--;
        if (depth > 0) word += character;
        index++;
      }
      if (depth !== 0) throw new Error(`Invalid Qsys Tcl at line ${command.line}: unmatched brace.`);
      words.push(word);
      continue;
    }
    if (start === '"') {
      let word = '';
      let closed = false;
      index++;
      while (index < value.length) {
        const character = value[index]!;
        const next = value[index + 1];
        if (character === '\\' && next !== undefined) {
          word += character + next;
          index += 2;
          continue;
        }
        if (character === '"') {
          closed = true;
          index++;
          break;
        }
        word += character;
        index++;
      }
      if (!closed) throw new Error(`Invalid Qsys Tcl at line ${command.line}: unmatched quote.`);
      words.push(decodeEscapes(word));
      continue;
    }
    let word = '';
    while (index < value.length && !/\s/.test(value[index]!)) {
      const character = value[index]!;
      const next = value[index + 1];
      if (character === '\\' && next !== undefined) {
        word += character + next;
        index += 2;
      } else {
        word += character;
        index++;
      }
    }
    words.push(decodeEscapes(word));
  }
  const [name, ...args] = words;
  return name ? { name, words: args, line: command.line } : undefined;
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
  const commands = splitCommands(script).map(tokenize).filter((command): command is TclCommand => Boolean(command));
  const warnings: string[] = [];
  const unsupported = new Set<string>();
  const modules: QsysModule[] = [];
  const moduleByName = new Map<string, QsysModule>();
  const pendingParameters = new Map<string, Record<string, string>>();
  const rawConnections: PendingConnection[] = [];
  const connectionByName = new Map<string, PendingConnection>();
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
    if (command.name === 'add_connection') {
      const [sourceEndpoint, targetEndpoint] = command.words;
      if (!sourceEndpoint || !targetEndpoint || hasSubstitution(command.words)) {
        warnings.push(`Skipped dynamic or incomplete connection at line ${command.line}.`);
        continue;
      }
      const connection: PendingConnection = {
        sourceEndpoint,
        targetEndpoint,
        line: command.line,
        parameters: {},
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
    connections.push({
      id: `connection-${connections.length}`,
      source,
      sourcePort,
      target,
      targetPort,
      kind: 'other',
      rawKind: 'unknown (static Tcl)',
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
      label: 'Static Qsys Tcl view. Run qsys-script to resolve exact interface types and ports.',
    },
    warnings,
  };
}
