// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import * as path from 'node:path';

export type TclVariableValue = string | number | boolean;

export function platformDesignerArguments(systemFilePath: string, searchPath: string): string[] {
  return [
    systemFilePath,
    `--search-path=${searchPath}`,
  ];
}

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

export function qsysTclExportWrapper(
  sourcePath: string,
  generatedSystemPath: string,
  variables: Record<string, TclVariableValue> = {},
): string {
  return [
    ...tclVariableAssignments(variables),
    `source ${quoteTclValue(normalizeTclPath(sourcePath))}`,
    `save_system ${quoteTclValue(normalizeTclPath(generatedSystemPath))}`,
    '',
  ].join('\n');
}

export function qsysTclInspectionWrapper(
  sourcePath: string,
  generatedSystemPath: string,
  inspectorPath: string,
  variables: Record<string, TclVariableValue> = {},
): string {
  return [
    ...tclVariableAssignments(variables),
    `source ${quoteTclValue(normalizeTclPath(sourcePath))}`,
    `save_system ${quoteTclValue(normalizeTclPath(generatedSystemPath))}`,
    `source ${quoteTclValue(normalizeTclPath(inspectorPath))}`,
    '',
  ].join('\n');
}

export function platformDesignerTemporaryPrefix(sourcePath: string): string {
  const extension = path.extname(sourcePath);
  const systemName = path.basename(sourcePath, extension);
  return path.join(path.dirname(sourcePath), `.qsys-view-${systemName}-`);
}

export function siblingQsysSearchPattern(projectDirectory: string): string {
  return path.join(projectDirectory, '*.qsys');
}

function normalizeTclPath(value: string): string {
  return value.replaceAll('\\', '/');
}

function tclVariableAssignments(variables: Record<string, TclVariableValue>): string[] {
  return Object.entries(variables).sort(([left], [right]) => left.localeCompare(right)).map(([rawName, value]) => {
    if (!/^(?:::)?[A-Za-z_][A-Za-z0-9_]*$/.test(rawName)) {
      throw new Error(`Invalid global Tcl variable name “${rawName}”.`);
    }
    const name = rawName.startsWith('::') ? rawName : `::${rawName}`;
    return `set ${name} ${quoteTclValue(String(value))}`;
  });
}

function quoteTclValue(value: string): string {
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('$', '\\$')
    .replaceAll('[', '\\[')}"`;
}
