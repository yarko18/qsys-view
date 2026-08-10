// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { spawn } from 'node:child_process';
import { tclVariableEntries, type TclVariableValue } from './qsysScript';

const tracePrefix = 'QSYS_VIEW_TRACE\t';

interface StaticTclTraceOptions {
  executable: string;
  controllerPath: string;
  sourcePath: string;
  allowedRoot: string;
  source: string;
  variables?: Record<string, TclVariableValue>;
  timeoutMs?: number;
}

export interface HwTclTraceOptions extends Omit<StaticTclTraceOptions, 'variables'> {
  parameters?: Record<string, TclVariableValue>;
}

export function extractStaticTclTrace(output: string): string {
  return output.split(/\r?\n/)
    .filter((line) => line.startsWith(tracePrefix))
    .map((line) => Buffer.from(line.slice(tracePrefix.length), 'base64').toString('utf8'))
    .join('\n');
}

export function traceQsysTcl({
  executable,
  controllerPath,
  sourcePath,
  allowedRoot,
  source,
  variables = {},
  timeoutMs = 3_000,
}: StaticTclTraceOptions): Promise<string> {
  const variableArguments = tclVariableEntries(variables).flatMap(([name, value]) => [name, value]);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [controllerPath, sourcePath, allowedRoot, ...variableArguments], {
      cwd: allowedRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const maxOutputBytes = 8 * 1024 * 1024;
    let stdout = '';
    let stderr = '';
    let settled = false;
    let oversized = false;
    let timedOut = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      action();
    };
    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next) <= maxOutputBytes) return next;
      oversized = true;
      child.kill('SIGTERM');
      return next.slice(-maxOutputBytes);
    };
    child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.stdin.on('error', () => {
      // A syntax or safety error may close stdin before Node finishes writing.
    });
    child.on('error', (error: NodeJS.ErrnoException) => finish(() => reject(new Error(
      error.code === 'ENOENT'
        ? `Tcl interpreter “${executable}” was not found.`
        : `Unable to start the Tcl interpreter: ${error.message}`,
    ))));
    child.on('close', (code) => finish(() => {
      if (code === 0 && !oversized && !timedOut) {
        resolve(extractStaticTclTrace(stdout));
        return;
      }
      const detail = stderr.trim().split(/\r?\n/).slice(-12).join('\n');
      const cause = timedOut
        ? `Safe Tcl resolution timed out after ${timeoutMs} ms.`
        : oversized
          ? 'Safe Tcl resolution produced too much output.'
          : `Safe Tcl resolution exited with code ${code ?? 'unknown'}.`;
      reject(new Error(`${cause}${detail ? `\n${detail}` : ''}`));
    }));
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdin.end(source);
  });
}

/**
 * Evaluates a Platform Designer component in the restricted Tcl interpreter.
 * The component controller treats argument pairs as parameter overrides and
 * invokes validation plus composition/elaboration callbacks without Quartus.
 */
export function traceHwTcl({
  parameters = {},
  timeoutMs = 5_000,
  ...options
}: HwTclTraceOptions): Promise<string> {
  return traceQsysTcl({
    ...options,
    variables: parameters,
    timeoutMs,
  });
}
