// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type {
  QsysComponentInterface,
  QsysComponentParameter,
  QsysGraph,
  QsysInterface,
  QsysInterfacePort,
} from './graph';
import { classifyConnection } from './qsysParser';
import { parseTclCommands } from './tclCommands';
import { parseQsysTcl } from './qsysTclParser';

function booleanOf(value: unknown, fallback: boolean): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function staticParameterMetadata(script: string): Map<string, QsysComponentParameter> {
  const parameters = new Map<string, QsysComponentParameter>();
  for (const command of parseTclCommands(script)) {
    if (command.name === 'add_parameter') {
      const [name, type = 'string', defaultValue = ''] = command.words;
      if (!name) continue;
      parameters.set(name, {
        name,
        type,
        value: defaultValue,
        defaultValue,
        enabled: true,
        visible: true,
        derived: false,
        valid: true,
      });
      continue;
    }
    if (command.name === 'set_parameter_property') {
      const [name, property = '', rawValue = ''] = command.words;
      const parameter = name ? parameters.get(name) : undefined;
      if (!parameter) continue;
      const propertyName = property.toUpperCase();
      if (propertyName === 'DEFAULT_VALUE') {
        parameter.defaultValue = rawValue;
        parameter.value = rawValue;
      } else if (propertyName === 'DISPLAY_NAME') parameter.displayName = rawValue;
      else if (propertyName === 'DESCRIPTION') parameter.description = rawValue;
      else if (propertyName === 'GROUP') parameter.group = rawValue;
      else if (propertyName === 'DISPLAY_HINT') parameter.displayHint = rawValue;
      else if (propertyName === 'ENABLED') parameter.enabled = booleanOf(rawValue, true);
      else if (propertyName === 'VISIBLE') parameter.visible = booleanOf(rawValue, true);
      else if (propertyName === 'DERIVED') parameter.derived = booleanOf(rawValue, false);
      else if (propertyName === 'VALID') parameter.valid = booleanOf(rawValue, true);
      else if (propertyName === 'ALLOWED_RANGES') {
        if (/^-?\d+(?:\.\d+)?:-?\d+(?:\.\d+)?$/.test(rawValue.trim())) {
          parameter.range = rawValue.trim();
        } else {
          parameter.allowedValues = parseTclList(rawValue).map((item) => {
            const labelSeparator = item.indexOf(':');
            return labelSeparator > 0 ? item.slice(0, labelSeparator) : item;
          });
        }
      }
      continue;
    }
    if (command.name === 'set_parameter_value' || command.name === 'qsys_view_component_value') {
      const [name, value = ''] = command.words;
      const parameter = name ? parameters.get(name) : undefined;
      if (parameter) parameter.value = value;
      continue;
    }
    if (command.name === 'add_display_item') {
      const [group, name, itemType] = command.words;
      if (itemType?.toLowerCase() === 'parameter' && name && parameters.has(name)) {
        parameters.get(name)!.group = group;
      }
    }
  }
  return parameters;
}

function parseTclList(value: string): string[] {
  try {
    return parseTclCommands(`list ${value}`)[0]?.words ?? [];
  } catch {
    return value.trim() ? [value.trim()] : [];
  }
}

function moduleProperty(script: string, propertyName: string): string | undefined {
  const property = propertyName.toUpperCase();
  let result: string | undefined;
  for (const command of parseTclCommands(script)) {
    const [name, value] = command.words;
    if (command.name === 'set_module_property' && name?.toUpperCase() === property && value) result = value;
  }
  return result;
}

function compositionBody(script: string): string | undefined {
  const callback = moduleProperty(script, 'COMPOSITION_CALLBACK') ?? 'compose';
  for (const command of parseTclCommands(script)) {
    const [name, , body] = command.words;
    if (command.name === 'proc' && name === callback && body !== undefined) return body;
  }
  return undefined;
}

/** Creates a non-executing preview used before the user authorizes Quartus. */
export function parseHwTclStatic(script: string, fallbackName: string): QsysGraph {
  const name = moduleProperty(script, 'DISPLAY_NAME')
    ?? moduleProperty(script, 'NAME')
    ?? fallbackName;
  const body = compositionBody(script);
  const topology = body ? parseQsysTcl(body, name) : parseQsysTcl('', name);
  const parameters = [...staticParameterMetadata(script).values()];
  const externalInterfaces = Object.entries(topology.exportedInterfaceMetadata ?? {}).map(([interfaceName, metadata]) => ({
    name: interfaceName,
    kind: metadata.kind,
    rawKind: metadata.rawKind,
    direction: metadata.direction,
    parameters: {},
    ports: [],
    exportOf: topology.exportedInterfaces?.[interfaceName],
  }));
  return {
    ...topology,
    name,
    warnings: [
      'Static component preview. Elaborate with Quartus to resolve callbacks, parameters, interfaces, and conditional structure.',
    ],
    diagnostics: [],
    metadata: {
      source: 'qsys-only',
      label: 'Static *_hw.tcl preview. Run component elaboration for the exact Platform Designer structure.',
    },
    component: {
      source: 'hw-tcl',
      exact: false,
      kind: moduleProperty(script, 'NAME'),
      version: moduleProperty(script, 'VERSION'),
      parameters,
      externalInterfaces,
    },
  };
}

interface MutableComponentInterface extends QsysComponentInterface {
  parameters: Record<string, string>;
  ports: QsysInterfacePort[];
}

const topologyCommands = new Set([
  'create_system',
  'add_instance',
  'set_instance_parameter_value',
  'add_interface',
  'set_interface_property',
  'add_connection',
  'set_connection_parameter_value',
  'set_interconnect_requirement',
]);

function resolvedTopologyTrace(trace: string): string {
  return trace.split(/\r?\n/).filter((line) => {
    try {
      const command = parseTclCommands(line)[0];
      return command ? topologyCommands.has(command.name) : false;
    } catch {
      return false;
    }
  }).join('\n');
}

function componentInterfaces(trace: string): QsysComponentInterface[] {
  const interfaces = new Map<string, MutableComponentInterface>();
  for (const command of parseTclCommands(trace)) {
    if (command.name === 'add_interface') {
      const [name, rawKind = 'unknown', direction = ''] = command.words;
      if (!name) continue;
      interfaces.set(name, {
        name,
        kind: classifyConnection(rawKind),
        rawKind,
        direction,
        parameters: {},
        ports: [],
      });
      continue;
    }
    if (command.name === 'set_interface_property') {
      const [name, property, value = ''] = command.words;
      const iface = name ? interfaces.get(name) : undefined;
      if (!iface || !property) continue;
      if (property.toUpperCase() === 'EXPORT_OF') iface.exportOf = value;
      else iface.parameters[property] = value;
      continue;
    }
    if (command.name === 'add_interface_port') {
      const [name, portName, role = '', direction = '', rawWidth = '0'] = command.words;
      const iface = name ? interfaces.get(name) : undefined;
      if (!iface || !portName) continue;
      const width = Number(rawWidth);
      iface.ports.push({
        name: portName,
        role: role.toLowerCase(),
        direction,
        width: Number.isFinite(width) ? width : 0,
      });
    }
  }
  return [...interfaces.values()];
}

function componentMode(trace: string): 'composition' | 'leaf' {
  let mode: 'composition' | 'leaf' = 'leaf';
  for (const command of parseTclCommands(trace)) {
    if (command.name === 'qsys_view_component_mode' && command.words[0] === 'composition') mode = 'composition';
  }
  return mode;
}

function componentDiagnostics(trace: string): NonNullable<QsysGraph['diagnostics']> {
  return parseTclCommands(trace).flatMap((command) => {
    if (command.name !== 'send_message') return [];
    const [rawSeverity = 'Warning', message = ''] = command.words;
    const severity = rawSeverity.toLowerCase() === 'error' ? 'error' as const : 'warning' as const;
    return [{ severity, message: message || `Platform Designer component reported ${rawSeverity}.` }];
  });
}

function safeModuleId(value: string): string {
  const result = value.trim().replace(/[^a-zA-Z0-9_]/g, '_');
  return result || 'component';
}

/**
 * Parses the command trace produced by the restricted component interpreter.
 * The trace contains the callback branch selected by the current parameters.
 */
export function parseEvaluatedHwTcl(trace: string, fallbackName: string): QsysGraph {
  const displayName = moduleProperty(trace, 'DISPLAY_NAME');
  const kind = moduleProperty(trace, 'NAME') ?? fallbackName;
  const name = displayName ?? kind;
  const mode = componentMode(trace);
  const externalInterfaces = componentInterfaces(trace);
  const parameters = [...staticParameterMetadata(trace).values()];
  const topology = parseQsysTcl(resolvedTopologyTrace(trace), name);
  const diagnostics = componentDiagnostics(trace);

  if (mode === 'composition') {
    const exportedInterfaces = Object.fromEntries(externalInterfaces.flatMap((iface) =>
      iface.exportOf ? [[iface.name, iface.exportOf]] : []));
    return {
      ...topology,
      name,
      metadata: {
        source: 'tcl',
        label: `Safe Tcl component elaboration (${topology.modules.length} internal IP, ${externalInterfaces.length} external interfaces).`,
      },
      warnings: topology.warnings.filter((warning) => warning !== 'No instances were found in this Qsys Tcl file.'),
      diagnostics: [...(topology.diagnostics ?? []), ...diagnostics],
      exportedInterfaces,
      exportedInterfaceMetadata: Object.fromEntries(externalInterfaces.map((iface) => [iface.name, {
        kind: iface.kind,
        rawKind: iface.rawKind,
        direction: iface.direction,
      }])),
      component: {
        source: 'hw-tcl',
        exact: true,
        kind,
        version: moduleProperty(trace, 'VERSION'),
        parameters,
        externalInterfaces,
      },
    };
  }

  const moduleId = safeModuleId(kind);
  const interfaces: Record<string, QsysInterface> = Object.fromEntries(externalInterfaces.map((iface) => [
    `${moduleId}.${iface.name}`,
    {
      module: moduleId,
      name: iface.name,
      kind: iface.rawKind,
      parameters: iface.parameters,
      ports: iface.ports,
      source: 'tcl' as const,
    },
  ]));
  const exportedInterfaces = Object.fromEntries(externalInterfaces.map((iface) => [
    iface.name,
    `${moduleId}.${iface.name}`,
  ]));
  return {
    name,
    modules: [{
      id: moduleId,
      name: moduleId,
      type: kind,
      disabled: false,
      parameters: Object.fromEntries(parameters.map((parameter) => [parameter.name, parameter.value])),
      ports: externalInterfaces.map((iface) => ({ name: iface.name, interfaceName: iface.name })),
    }],
    connections: [],
    interfaces,
    metadata: {
      source: 'tcl',
      label: `Safe Tcl component elaboration (${externalInterfaces.length} external interfaces).`,
    },
    warnings: [],
    diagnostics,
    exportedInterfaces,
    exportedInterfaceMetadata: Object.fromEntries(externalInterfaces.map((iface) => [iface.name, {
      kind: iface.kind,
      rawKind: iface.rawKind,
      direction: iface.direction,
    }])),
    component: {
      source: 'hw-tcl',
      exact: true,
      kind,
      version: moduleProperty(trace, 'VERSION'),
      parameters,
      externalInterfaces,
    },
  };
}
