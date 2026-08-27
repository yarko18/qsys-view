// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import * as path from 'node:path';

export type TclVariableValue = string | number | boolean;

export function quartusTemporaryEnvironment(
  temporaryDirectory: string,
  inheritedEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment = { ...inheritedEnvironment };
  for (const name of Object.keys(environment)) {
    if (['TMP', 'TEMP', 'TMPDIR'].includes(name.toUpperCase())) delete environment[name];
  }
  return {
    ...environment,
    TMP: temporaryDirectory,
    TEMP: temporaryDirectory,
    TMPDIR: temporaryDirectory,
  };
}

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

/**
 * Quartus on Windows derives an internal project name from the qsys-script
 * working directory. Keep that directory free of dashes and other characters
 * which are valid in a filesystem path but invalid in a Quartus project name.
 */
export function qsysAnalysisTemporaryPrefix(
  temporaryRoot: string,
  format: 'qsys' | 'tcl',
): string {
  return path.join(temporaryRoot, format === 'tcl' ? 'qsys_view_tcl_' : 'qsys_view_');
}

export function platformDesignerScratchPrefix(temporaryRoot: string): string {
  return path.join(temporaryRoot, 'qsys_view_pd_');
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
  const systemName = path.basename(sourcePath, extension).replaceAll(/[^A-Za-z0-9_]/g, '_');
  return path.join(path.dirname(sourcePath), `qsys_view_${systemName}_`);
}

export function siblingQsysSearchPattern(projectDirectory: string): string {
  return path.join(projectDirectory, '*.qsys');
}

export function automaticQsysSearchPaths(
  projectDirectory: string,
  includeSiblingQsys = true,
): string[] {
  return [
    ...(includeSiblingQsys ? [siblingQsysSearchPattern(projectDirectory)] : []),
    path.join(projectDirectory, 'ip', '*', 'component.ipx'),
    path.join(projectDirectory, 'ip', 'common', '**', '*_hw.tcl'),
    path.join(projectDirectory, '*', 'component.ipx'),
    '$',
  ];
}

export function preparedSubsystemSearchPath(
  temporaryDirectory: string,
  qsysDependencies: string[],
  searchPath: string,
): string {
  return [
    path.join(temporaryDirectory, '*.qsys'),
    ...qsysDependencies,
    searchPath,
  ].filter(Boolean).join(',');
}

function normalizeTclPath(value: string): string {
  return value.replaceAll('\\', '/');
}

function tclVariableAssignments(variables: Record<string, TclVariableValue>): string[] {
  return tclVariableEntries(variables).map(([name, value]) => `set ${name} ${quoteTclValue(value)}`);
}

export function tclVariableEntries(variables: Record<string, TclVariableValue>): Array<[string, string]> {
  return Object.entries(variables).sort(([left], [right]) => left.localeCompare(right)).map(([rawName, value]) => {
    if (!/^(?:::)?[A-Za-z_][A-Za-z0-9_]*$/.test(rawName)) {
      throw new Error(`Invalid global Tcl variable name “${rawName}”.`);
    }
    const name = rawName.startsWith('::') ? rawName : `::${rawName}`;
    return [name, String(value)];
  });
}

function quoteTclValue(value: string): string {
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('$', '\\$')
    .replaceAll('[', '\\[')}"`;
}
