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

export interface SubsystemBuildPlan {
  tcl: string[];
  qsys: string[];
}

/** Returns all subsystem resources in dependency-first order, grouped by source format. */
export async function subsystemBuildPlan(
  rootResource: string,
  rootGraph: QsysGraph,
  loadGraph: (resource: string) => Promise<QsysGraph>,
): Promise<SubsystemBuildPlan> {
  const visited = new Set([rootResource]);
  const plan: SubsystemBuildPlan = { tcl: [], qsys: [] };
  const visit = async (graph: QsysGraph): Promise<void> => {
    for (const module of graph.modules) {
      const reference = module.subsystem;
      if (!reference || visited.has(reference.resource)) continue;
      visited.add(reference.resource);
      const child = await loadGraph(reference.resource);
      await visit(child);
      plan[reference.format].push(reference.resource);
    }
  };
  await visit(rootGraph);
  return plan;
}

/** Returns Tcl subsystem resources in dependency-first build order. */
export async function tclSubsystemBuildOrder(
  rootResource: string,
  rootGraph: QsysGraph,
  loadGraph: (resource: string) => Promise<QsysGraph>,
): Promise<string[]> {
  return (await subsystemBuildPlan(rootResource, rootGraph, loadGraph)).tcl;
}
