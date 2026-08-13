// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type {
  QsysComponentFile,
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
  return callbackBody(script, 'COMPOSITION_CALLBACK', 'compose');
}

function callbackBody(script: string, property: string, fallback: string): string | undefined {
  const callback = moduleProperty(script, property) ?? fallback;
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
  const callback = body ?? callbackBody(script, 'ELABORATION_CALLBACK', 'elaborate') ?? '';
  const declaredInterfaces = componentInterfaces(`${script}\n${callback}`);
  const externalInterfaces = mergeComponentInterfaces(declaredInterfaces, topology);
  const files = componentFiles(script);
  const mode = body ? 'composition' : 'leaf';
  const warning = 'Static component preview. Elaborate with the safe Tcl interpreter to resolve callbacks, parameters, interfaces, and conditional structure.';
  const composition: QsysGraph | undefined = mode === 'composition' ? {
    ...topology,
    name,
    warnings: topology.warnings.filter((item) => item !== 'No instances were found in this Qsys Tcl file.'),
    diagnostics: [],
    metadata: {
      source: 'qsys-only',
      label: 'Static composition preview. Safe Tcl elaboration is needed for the selected callback branches.',
    },
  } : undefined;
  return componentBlockGraph({
    name,
    kind: moduleProperty(script, 'NAME') ?? fallbackName,
    version: moduleProperty(script, 'VERSION'),
    exact: false,
    mode,
    parameters,
    externalInterfaces,
    files,
    composition,
    warnings: [warning],
    diagnostics: [],
    label: mode === 'composition'
      ? `Static composition component (${composition?.modules.length ?? 0} internal IP).`
      : 'Static leaf component preview. Safe Tcl elaboration is needed for dynamic interfaces.',
  });
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

function mergeComponentInterfaces(
  declared: QsysComponentInterface[],
  topology: QsysGraph,
): QsysComponentInterface[] {
  const interfaces = new Map(declared.map((iface) => [iface.name, iface]));
  for (const [name, metadata] of Object.entries(topology.exportedInterfaceMetadata ?? {})) {
    const existing = interfaces.get(name);
    interfaces.set(name, existing ? {
      ...existing,
      exportOf: topology.exportedInterfaces?.[name] ?? existing.exportOf,
    } : {
      name,
      kind: metadata.kind,
      rawKind: metadata.rawKind,
      direction: metadata.direction,
      parameters: {},
      ports: [],
      exportOf: topology.exportedInterfaces?.[name],
    });
  }
  return [...interfaces.values()];
}

interface FileRegistration {
  name: string;
  path: string;
  type: string;
  origin?: string;
}

function normalizedFilePath(value: string): string {
  const unix = value.replaceAll('\\', '/');
  const absolute = unix.startsWith('/');
  const parts: string[] = [];
  for (const part of unix.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..' && parts.length > 0 && parts.at(-1) !== '..') parts.pop();
    else parts.push(part);
  }
  return `${absolute ? '/' : ''}${parts.join('/')}` || (absolute ? '/' : '.');
}

function semanticFileHelper(stack: string): string | undefined {
  const generic = /^(?:add_static_[a-z0-9_]+_file|add_pkg_sv_file|setup_filesets)$/i;
  return [...parseTclList(stack)].reverse().find((name) =>
    /^add_[a-z0-9_]+$/i.test(name) && !generic.test(name));
}

function fileTypeForRegistration(command: string): string {
  if (/_sv_file$/i.test(command)) return 'SYSTEM_VERILOG';
  if (/_vhdl_file$/i.test(command)) return 'VHDL';
  if (/_ver_file$/i.test(command)) return 'VERILOG';
  if (/_sdc_file$/i.test(command)) return 'SDC';
  if (/_hex_file$/i.test(command)) return 'HEX';
  if (/_misc_file$/i.test(command)) return 'OTHER';
  return 'SOURCE';
}

function fileRegistration(commandText: string, stack: string): FileRegistration | undefined {
  const command = parseTclCommands(commandText)[0];
  if (!command || !/^add_(?:static_[a-z0-9_]+_file|(?:c|cpp|h|hpp)_file)$/i.test(command.name)) {
    return undefined;
  }
  const [fileName, relativePath = '.'] = command.words;
  return fileName ? {
    name: fileName,
    path: normalizedFilePath(`${relativePath}/${fileName}`),
    type: fileTypeForRegistration(command.name),
    origin: semanticFileHelper(stack),
  } : undefined;
}

/** Collects the effective files after sourced helper procedures have run. */
function componentFiles(trace: string): QsysComponentFile[] {
  const registrations = new Map<string, FileRegistration>();
  const filesets = new Map<string, string>();
  const files = new Map<string, QsysComponentFile>();
  const latestByLogicalName = new Map<string, QsysComponentFile>();
  const usedRegistrations = new Set<string>();
  let activeFileset = '';

  for (const command of parseTclCommands(trace)) {
    if (command.name === 'qsys_view_component_file_registration') {
      const [, commandText = '', stack = ''] = command.words;
      const registration = fileRegistration(commandText, stack);
      if (registration) registrations.set(registration.path, registration);
      continue;
    }
    if (command.name === 'add_fileset') {
      const [name, purpose = ''] = command.words;
      if (name) {
        activeFileset = name;
        filesets.set(name, purpose || name);
      }
      continue;
    }
    if (command.name === 'add_fileset_file') {
      const [logicalName, type = 'OTHER'] = command.words;
      if (!logicalName) continue;
      const pathMarker = command.words.findIndex((word) => word.toUpperCase() === 'PATH');
      const rawPath = pathMarker >= 0 ? command.words[pathMarker + 1] : undefined;
      const filePath = normalizedFilePath(rawPath || logicalName);
      const registration = registrations.get(filePath);
      if (registration) usedRegistrations.add(registration.path);
      const origin = registration?.origin;
      const key = `${logicalName}\u0000${filePath}\u0000${type}`;
      const existing = files.get(key);
      const fileset = filesets.get(activeFileset) || activeFileset;
      const tagWords = pathMarker >= 0 ? command.words.slice(pathMarker + 2) : command.words.slice(2);
      const tags = tagWords.flatMap(parseTclList);
      const file = existing ?? {
        name: logicalName,
        path: filePath,
        type,
        origin,
        filesets: [],
        tags: [],
        attributes: {},
      };
      if (fileset && !file.filesets.includes(fileset)) file.filesets.push(fileset);
      for (const tag of tags) if (tag && !file.tags.includes(tag)) file.tags.push(tag);
      files.set(key, file);
      latestByLogicalName.set(logicalName, file);
      continue;
    }
    if (command.name === 'set_fileset_file_attribute') {
      const [logicalName, attribute, value = ''] = command.words;
      const file = logicalName ? latestByLogicalName.get(logicalName) : undefined;
      if (file && attribute) file.attributes[attribute] = value;
    }
  }
  for (const registration of registrations.values()) {
    if (usedRegistrations.has(registration.path)) continue;
    files.set(`registration\u0000${registration.path}\u0000${registration.type}`, {
      name: registration.name,
      path: registration.path,
      type: registration.type,
      origin: registration.origin,
      filesets: [],
      tags: [],
      attributes: {},
    });
  }
  return [...files.values()];
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
    if (command.name === 'qsys_view_component_callback_error') {
      const [callback = 'component callback', message = ''] = command.words;
      return [{
        severity: 'warning' as const,
        message: `${callback} stopped early: ${message || 'unknown Tcl error'}`,
      }];
    }
    if (command.name !== 'send_message') return [];
    const [rawSeverity = 'Warning', message = ''] = command.words;
    const severity = rawSeverity.toLowerCase() === 'error' ? 'error' as const : 'warning' as const;
    return [{ severity, message: message || `Platform Designer component reported ${rawSeverity}.` }];
  });
}

function callbackFailed(trace: string): boolean {
  return parseTclCommands(trace).some((command) => command.name === 'qsys_view_component_callback_error');
}

function mergeElaboratedInterfaces(
  fallback: QsysComponentInterface[],
  evaluated: QsysComponentInterface[],
): QsysComponentInterface[] {
  const merged = new Map(fallback.map((iface) => [iface.name, iface]));
  for (const iface of evaluated) {
    const previous = merged.get(iface.name);
    merged.set(iface.name, previous ? {
      ...previous,
      ...iface,
      parameters: { ...previous.parameters, ...iface.parameters },
      ports: iface.ports.length > 0 ? iface.ports : previous.ports,
      exportOf: iface.exportOf ?? previous.exportOf,
    } : iface);
  }
  return [...merged.values()];
}

function mergeCompositionGraphs(fallback: QsysGraph | undefined, evaluated: QsysGraph): QsysGraph {
  if (!fallback) return evaluated;
  const modules = new Map(fallback.modules.map((module) => [module.id, module]));
  for (const module of evaluated.modules) {
    const previous = modules.get(module.id);
    modules.set(module.id, previous ? {
      ...previous,
      ...module,
      parameters: { ...previous.parameters, ...module.parameters },
      ports: module.ports.length > 0 ? module.ports : previous.ports,
    } : module);
  }
  const connections = new Map(fallback.connections.map((connection) => [connection.id, connection]));
  for (const connection of evaluated.connections) connections.set(connection.id, connection);
  return {
    ...fallback,
    ...evaluated,
    modules: [...modules.values()],
    connections: [...connections.values()],
    interfaces: { ...fallback.interfaces, ...evaluated.interfaces },
    exportedInterfaces: { ...fallback.exportedInterfaces, ...evaluated.exportedInterfaces },
    exportedInterfaceMetadata: {
      ...fallback.exportedInterfaceMetadata,
      ...evaluated.exportedInterfaceMetadata,
    },
    warnings: [...new Set([...fallback.warnings, ...evaluated.warnings])],
    diagnostics: [...(fallback.diagnostics ?? []), ...(evaluated.diagnostics ?? [])],
  };
}

function safeModuleId(value: string): string {
  const result = value.trim().replace(/[^a-zA-Z0-9_]/g, '_');
  return result || 'component';
}

interface ComponentBlockOptions {
  name: string;
  kind: string;
  version?: string;
  exact: boolean;
  mode: 'composition' | 'leaf';
  parameters: QsysComponentParameter[];
  externalInterfaces: QsysComponentInterface[];
  files?: QsysComponentFile[];
  composition?: QsysGraph;
  warnings: string[];
  diagnostics: NonNullable<QsysGraph['diagnostics']>;
  label: string;
}

/** Builds the single Platform Designer component block shared by leaf and composition definitions. */
function componentBlockGraph({
  name,
  kind,
  version,
  exact,
  mode,
  parameters,
  externalInterfaces,
  files = [],
  composition,
  warnings,
  diagnostics,
  label,
}: ComponentBlockOptions): QsysGraph {
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
      name,
      type: kind,
      disabled: false,
      parameters: Object.fromEntries(parameters.map((parameter) => [parameter.name, parameter.value])),
      ports: externalInterfaces.map((iface) => ({ name: iface.name, interfaceName: iface.name })),
    }],
    connections: [],
    interfaces,
    metadata: { source: exact ? 'tcl' : 'qsys-only', label },
    warnings,
    diagnostics,
    exportedInterfaces,
    exportedInterfaceMetadata: Object.fromEntries(externalInterfaces.map((iface) => [iface.name, {
      kind: iface.kind,
      rawKind: iface.rawKind,
      direction: iface.direction,
    }])),
    component: {
      source: 'hw-tcl',
      exact,
      mode,
      moduleId,
      kind,
      version,
      parameters,
      externalInterfaces,
      files,
      composition,
    },
  };
}

/**
 * Parses the command trace produced by the restricted component interpreter.
 * The trace contains the callback branch selected by the current parameters.
 */
export function parseEvaluatedHwTcl(
  trace: string,
  fallbackName: string,
  fallback?: QsysGraph,
): QsysGraph {
  const displayName = moduleProperty(trace, 'DISPLAY_NAME');
  const kind = moduleProperty(trace, 'NAME') ?? fallbackName;
  const name = displayName ?? kind;
  const mode = componentMode(trace);
  const externalInterfaces = mergeElaboratedInterfaces(
    fallback?.component?.externalInterfaces ?? [],
    componentInterfaces(trace),
  );
  const parameters = [...staticParameterMetadata(trace).values()];
  const topology = parseQsysTcl(resolvedTopologyTrace(trace), name);
  const diagnostics = componentDiagnostics(trace);
  const files = componentFiles(trace);
  const exact = !callbackFailed(trace);

  if (mode === 'composition') {
    const exportedInterfaces = Object.fromEntries(externalInterfaces.flatMap((iface) =>
      iface.exportOf ? [[iface.name, iface.exportOf]] : []));
    const evaluatedComposition: QsysGraph = {
      ...topology,
      name,
      metadata: {
        source: 'tcl',
        label: `Elaborated composition (${topology.modules.length} internal IP, ${externalInterfaces.length} external interfaces).`,
      },
      warnings: topology.warnings.filter((warning) => warning !== 'No instances were found in this Qsys Tcl file.'),
      diagnostics: topology.diagnostics ?? [],
      exportedInterfaces,
      exportedInterfaceMetadata: Object.fromEntries(externalInterfaces.map((iface) => [iface.name, {
        kind: iface.kind,
        rawKind: iface.rawKind,
        direction: iface.direction,
      }])),
    };
    const composition = mergeCompositionGraphs(fallback?.component?.composition, evaluatedComposition);
    return componentBlockGraph({
      name,
      kind,
      version: moduleProperty(trace, 'VERSION'),
      exact,
      mode,
      parameters,
      externalInterfaces,
      files,
      composition,
      warnings: composition.warnings,
      diagnostics: [...(topology.diagnostics ?? []), ...diagnostics],
      label: exact
        ? `Safe Tcl component elaboration (composition, ${composition.modules.length} internal IP, ${externalInterfaces.length} external interfaces).`
        : `Partial safe Tcl component elaboration (${composition.modules.length} internal IP, ${externalInterfaces.length} external interfaces).`,
    });
  }
  return componentBlockGraph({
    name,
    kind,
    version: moduleProperty(trace, 'VERSION'),
    exact,
    mode,
    parameters,
    externalInterfaces,
    files,
    warnings: [],
    diagnostics,
    label: exact
      ? `Safe Tcl component elaboration (leaf, ${externalInterfaces.length} external interfaces).`
      : `Partial safe Tcl component elaboration (leaf, ${externalInterfaces.length} external interfaces).`,
  });
}
