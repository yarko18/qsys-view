// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { qsysScriptArguments } from '../src/qsysScript';

describe('qsysScriptArguments', () => {
  it.each([
    '/tmp/qsys-view-Q9db5F/video.qsys',
    String.raw`C:\Users\WSWPC\AppData\Local\Temp\qsys-view-Q9db5F\video.qsys`,
  ])('passes only the Qsys file name for %s', (systemFilePath) => {
    expect(qsysScriptArguments(systemFilePath, 'ip-search-path', 'inspect-interfaces.tcl')).toEqual([
      '--system-file=video.qsys',
      '--search-path=ip-search-path',
      '--script=inspect-interfaces.tcl',
    ]);
  });
});
