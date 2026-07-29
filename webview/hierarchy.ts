// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysConnection, QsysGraph, QsysInterface, QsysModule } from '../parser/graph';

interface ComposedParts {
  modules: QsysModule[];
  connections: QsysConnection[];
  interfaces: Record<string, QsysInterface>;
  domainAliases: Record<string, string>;
}

interface Endpoint {
  module: string;
  port: string;
}

function splitEndpoint(endpoint: string): Endpoint {
  const separator = endpoint.lastIndexOf('.');
  return separator < 0
    ? { module: endpoint, port: '' }
    : { module: endpoint.slice(0, separator), port: endpoint.slice(separator + 1) };
}

function qualified(prefix: string, id: string): string {
  return `${prefix}${id}`;
}

function childPrefix(prefix: string, id: string): string {
  return `${qualified(prefix, id)}/`;
}

function resolveEndpoint(
  graph: QsysGraph,
  prefix: string,
  moduleId: string,
  port: string,
  expanded: ReadonlyMap<string, QsysGraph>,
): Endpoint {
  const module = qualified(prefix, moduleId);
  const child = expanded.get(module);
  const internal = child?.exportedInterfaces?.[port];
  if (!child || !internal) return { module, port };
  const endpoint = splitEndpoint(internal);
  return resolveEndpoint(child, childPrefix(prefix, moduleId), endpoint.module, endpoint.port, expanded);
}

function composeParts(
  graph: QsysGraph,
  prefix: string,
  hierarchyPath: string[],
  expanded: ReadonlyMap<string, QsysGraph>,
): ComposedParts {
  const parts: ComposedParts = { modules: [], connections: [], interfaces: {}, domainAliases: {} };

  for (const module of graph.modules) {
    const child = expanded.get(qualified(prefix, module.id));
    if (child) {
      const nested = composeParts(child, childPrefix(prefix, module.id), [...hierarchyPath, module.name], expanded);
      parts.modules.push(...nested.modules);
      parts.connections.push(...nested.connections);
      Object.assign(parts.interfaces, nested.interfaces);
      Object.assign(parts.domainAliases, nested.domainAliases);
    } else {
      parts.modules.push({
        ...module,
        id: qualified(prefix, module.id),
        hierarchyPath: hierarchyPath.length > 0 ? hierarchyPath : undefined,
      });
    }
  }

  for (const connection of graph.connections) {
    const source = resolveEndpoint(graph, prefix, connection.source, connection.sourcePort, expanded);
    const target = resolveEndpoint(graph, prefix, connection.target, connection.targetPort, expanded);
    parts.connections.push({
      ...connection,
      id: qualified(prefix, connection.id),
      source: source.module,
      sourcePort: source.port,
      target: target.module,
      targetPort: target.port,
    });

    const alias = expandedDomainAlias(graph, prefix, connection, source, expanded);
    if (alias) parts.domainAliases[alias.endpoint] = alias.canonical;
  }

  for (const [address, iface] of Object.entries(graph.interfaces)) {
    const endpoint = splitEndpoint(address);
    const resolved = resolveEndpoint(graph, prefix, endpoint.module, endpoint.port, expanded);
    parts.interfaces[`${resolved.module}.${resolved.port}`] = {
      ...iface,
      module: resolved.module,
      name: resolved.port,
    };
  }

  return parts;
}

/** Replaces only explicitly expanded subsystem instances with their internal graph. */
export function composeHierarchy(
  root: QsysGraph,
  expanded: ReadonlyMap<string, QsysGraph>,
): QsysGraph {
  const parts = composeParts(root, '', [], expanded);
  return {
    ...root,
    modules: parts.modules,
    connections: parts.connections,
    interfaces: parts.interfaces,
    domainAliases: parts.domainAliases,
  };
}

/**
 * A clock_source instance inside an expanded subsystem represents the same
 * domain on both sides of its exported sink. Preserve that identity so the UI
 * does not display a second domain merely because the hierarchy was expanded.
 */
function expandedDomainAlias(
  graph: QsysGraph,
  prefix: string,
  connection: QsysConnection,
  source: Endpoint,
  expanded: ReadonlyMap<string, QsysGraph>,
): { endpoint: string; canonical: string } | undefined {
  if (connection.kind !== 'clock' && connection.kind !== 'reset') return undefined;
  const instanceId = qualified(prefix, connection.target);
  const child = expanded.get(instanceId);
  const exported = child?.exportedInterfaces?.[connection.targetPort];
  if (!child || !exported) return undefined;

  const internalSink = splitEndpoint(exported);
  const bridge = child.modules.find((module) => module.id === internalSink.module);
  if (bridge?.type !== 'clock_source') return undefined;

  const sourceEndpoints = [...new Set(child.connections
    .filter((candidate) => candidate.kind === connection.kind && candidate.source === internalSink.module)
    .map((candidate) => `${candidate.source}.${candidate.sourcePort}`))];
  if (sourceEndpoints.length !== 1) return undefined;

  const internalSource = splitEndpoint(sourceEndpoints[0]!);
  const resolved = resolveEndpoint(
    child,
    childPrefix(prefix, connection.target),
    internalSource.module,
    internalSource.port,
    expanded,
  );
  return {
    endpoint: `${resolved.module}.${resolved.port}`,
    canonical: `${source.module}.${source.port}`,
  };
}
