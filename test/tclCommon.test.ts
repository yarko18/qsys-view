// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const defaultTclsh = process.platform === 'win32' ? 'tclsh.exe' : 'tclsh';
const helperPath = fileURLToPath(new URL('../quartus/safe-common.tcl', import.meta.url));
const tclshAvailable = !spawnSync(defaultTclsh, [], { input: 'exit 0\n' }).error;

function evaluateTcl(script: string, executable = defaultTclsh): string {
  const result = spawnSync(executable, [], {
    input: `source $::env(QSYS_VIEW_SAFE_COMMON)\n${script}`,
    encoding: 'utf8',
    env: { ...process.env, QSYS_VIEW_SAFE_COMMON: helperPath },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `Tcl exited with ${result.status}`);
  return result.stdout.trim();
}

describe.skipIf(!tclshAvailable)('safe Tcl compatibility helpers', () => {
  it('encodes UTF-8 trace payloads without Tcl 8.6 binary encode', () => {
    const value = 'target_1 → target_2';
    const encoded = evaluateTcl(`puts [qv_base64_encode [encoding convertto utf-8 {${value}}]]\n`);
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(value);
  });

  it('compares normalized Windows paths with Windows separators and casing', () => {
    const output = evaluateTcl(`
      puts [qv_normalized_path_is_within {C:\\Projects\\Target\\ip\\core.tcl} {c:/projects/target} windows]
      puts [qv_normalized_path_is_within {C:\\Projects\\Target-Other\\core.tcl} {c:/projects/target} windows]
    `);
    expect(output.split(/\r?\n/)).toEqual(['1', '0']);
  });
});
