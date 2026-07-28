// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { qsysScriptArguments, qsysTclExportWrapper, qsysTclScriptArguments, temporaryPlatformDesignerDirectory } from '../src/qsysScript';

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

describe('qsysTclScriptArguments', () => {
  it('runs the disposable wrapper without pretending it is a Qsys system file', () => {
    expect(qsysTclScriptArguments('ip-search-path', '/tmp/qsys-view/inspect-tcl.tcl')).toEqual([
      '--search-path=ip-search-path',
      '--script=/tmp/qsys-view/inspect-tcl.tcl',
    ]);
  });
});

describe('qsysTclExportWrapper', () => {
  it('creates a disposable Tcl wrapper that exports a temporary Qsys system', () => {
    expect(qsysTclExportWrapper('/tmp/source.tcl', '/tmp/generated.qsys')).toEqual([
      'source "/tmp/source.tcl"',
      'save_system "/tmp/generated.qsys"',
      '',
    ].join('\n'));
  });

  it('uses forward slashes for Windows-style Tcl paths', () => {
    expect(qsysTclExportWrapper('C:\\work\\design.tcl', 'C:\\work\\tmp_design\\design.qsys')).toEqual([
      'source "C:/work/design.tcl"',
      'save_system "C:/work/tmp_design/design.qsys"',
      '',
    ].join('\n'));
  });
});

describe('temporaryPlatformDesignerDirectory', () => {
  it('creates a sibling folder named tmp_<stem> for Tcl sources', () => {
    expect(temporaryPlatformDesignerDirectory('/tmp/project/design.tcl')).toBe('/tmp/project/tmp_design');
  });
});
