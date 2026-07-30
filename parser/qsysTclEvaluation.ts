// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysGraph } from './graph';
import { parseQsys } from './qsysParser';
import { applyQuartusMetadata } from './quartusMetadataParser';

/** Builds the graph from the Qsys file produced by executing a Tcl system. */
export function parseEvaluatedQsysTcl(
  qsysXml: string,
  fallbackName: string,
  inspectorOutput: string,
  executable: string,
): QsysGraph {
  return applyQuartusMetadata(parseQsys(qsysXml, fallbackName), inspectorOutput, executable);
}
