// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import * as path from 'node:path';
import type { QsysGraph } from '../parser/graph';

export function subsystemCandidatePaths(parentFilePath: string, moduleType: string): string[] {
  if (!/^[A-Za-z0-9_.-]+$/.test(moduleType) || moduleType === 'unknown') return [];
  const parentExtension = path.extname(parentFilePath).toLowerCase();
  const extensions = parentExtension === '.tcl' ? ['.tcl', '.qsys'] : ['.qsys', '.tcl'];
  return extensions.map((extension) => path.join(path.dirname(parentFilePath), `${moduleType}${extension}`));
}

/** Returns Tcl subsystem resources in dependency-first build order. */
export async function tclSubsystemBuildOrder(
  rootResource: string,
  rootGraph: QsysGraph,
  loadGraph: (resource: string) => Promise<QsysGraph>,
): Promise<string[]> {
  const visited = new Set([rootResource]);
  const order: string[] = [];
  const visit = async (graph: QsysGraph): Promise<void> => {
    for (const module of graph.modules) {
      const reference = module.subsystem;
      if (!reference || reference.format !== 'tcl' || visited.has(reference.resource)) continue;
      visited.add(reference.resource);
      const child = await loadGraph(reference.resource);
      await visit(child);
      order.push(reference.resource);
    }
  };
  await visit(rootGraph);
  return order;
}
