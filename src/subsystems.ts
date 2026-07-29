// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import * as path from 'node:path';

export function subsystemCandidatePaths(parentFilePath: string, moduleType: string): string[] {
  if (!/^[A-Za-z0-9_.-]+$/.test(moduleType) || moduleType === 'unknown') return [];
  const parentExtension = path.extname(parentFilePath).toLowerCase();
  const extensions = parentExtension === '.tcl' ? ['.tcl', '.qsys'] : ['.qsys', '.tcl'];
  return extensions.map((extension) => path.join(path.dirname(parentFilePath), `${moduleType}${extension}`));
}
