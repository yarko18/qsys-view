// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import * as path from 'node:path';

export function qsysScriptArguments(
  systemFilePath: string,
  searchPath: string,
  inspectorPath: string,
): string[] {
  // qsys-script derives the HDL system name from --system-file. On Windows an
  // absolute path is therefore interpreted as an HDL name containing `C:\\...`.
  // The process already runs in the temporary system directory, so only the
  // file name is required. Apply both path flavours to keep this testable and
  // robust regardless of the host running the extension.
  const systemFileName = path.win32.basename(path.posix.basename(systemFilePath));
  return [
    `--system-file=${systemFileName}`,
    `--search-path=${searchPath}`,
    `--script=${inspectorPath}`,
  ];
}

export function qsysTclScriptArguments(searchPath: string, wrapperPath: string): string[] {
  return [
    `--search-path=${searchPath}`,
    `--script=${wrapperPath}`,
  ];
}

export function qsysTclExportWrapper(sourcePath: string, generatedSystemPath: string): string {
  return [
    `source ${quoteTclValue(normalizeTclPath(sourcePath))}`,
    `save_system ${quoteTclValue(normalizeTclPath(generatedSystemPath))}`,
    '',
  ].join('\n');
}

function normalizeTclPath(value: string): string {
  return value.replaceAll('\\', '/');
}

function quoteTclValue(value: string): string {
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('$', '\\$')
    .replaceAll('[', '\\[')}"`;
}
