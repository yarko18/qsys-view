// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { platformDesignerArguments, platformDesignerTemporaryPrefix, qsysAnalysisTemporaryPrefix, qsysScriptArguments, qsysTclExportWrapper, qsysTclInspectionWrapper, qsysTclScriptArguments, siblingQsysSearchPattern } from '../src/qsysScript';

describe('platformDesignerArguments', () => {
  it('keeps the original IP search path when opening a disposable Qsys file', () => {
    expect(platformDesignerArguments(
      '/work/quartus/.qsys-view-video-AbCd12/video.qsys',
      '/work/quartus/ip/*/component.ipx,$',
    )).toEqual([
      '/work/quartus/.qsys-view-video-AbCd12/video.qsys',
      '--search-path=/work/quartus/ip/*/component.ipx,$',
    ]);
  });
});

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

describe('qsysAnalysisTemporaryPrefix', () => {
  it('uses Quartus-safe working-directory names for Windows analysis', () => {
    expect(qsysAnalysisTemporaryPrefix('/tmp', 'qsys')).toBe('/tmp/qsys_view_');
    expect(qsysAnalysisTemporaryPrefix('/tmp', 'tcl')).toBe('/tmp/qsys_view_tcl_');
    expect(qsysAnalysisTemporaryPrefix('/tmp', 'tcl')).not.toContain('-');
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

  it('quotes Tcl substitutions in file paths', () => {
    expect(qsysTclExportWrapper('/tmp/$source[0].tcl', '/tmp/output[0]$.qsys')).toEqual([
      'source "/tmp/\\$source\\[0].tcl"',
      'save_system "/tmp/output\\[0]\\$.qsys"',
      '',
    ].join('\n'));
  });

  it('sources the original Tcl path so sibling includes resolve through info script', () => {
    expect(qsysTclExportWrapper(
      '/work/quartus/video.tcl',
      '/work/quartus/.qsys-view-video-AbCd12/video.qsys',
    )).toEqual([
      'source "/work/quartus/video.tcl"',
      'save_system "/work/quartus/.qsys-view-video-AbCd12/video.qsys"',
      '',
    ].join('\n'));
  });

  it('sets configured global variables before sourcing the design', () => {
    expect(qsysTclExportWrapper(
      '/work/quartus/video.tcl',
      '/tmp/video.qsys',
      { PLATFORM_CONFIG: 'WTC', FEATURE_DEBUG: false },
    )).toEqual([
      'set ::FEATURE_DEBUG "false"',
      'set ::PLATFORM_CONFIG "WTC"',
      'source "/work/quartus/video.tcl"',
      'save_system "/tmp/video.qsys"',
      '',
    ].join('\n'));
  });

  it('rejects Tcl variable names that could inject commands', () => {
    expect(() => qsysTclExportWrapper('/work/video.tcl', '/tmp/video.qsys', {
      'PLATFORM_CONFIG;error': 'WTC',
    })).toThrow(/invalid global Tcl variable name/i);
  });
});

describe('qsysTclInspectionWrapper', () => {
  it('saves the evaluated system before running the interface inspector', () => {
    expect(qsysTclInspectionWrapper(
      '/work/quartus/video.tcl',
      '/tmp/evaluated.qsys',
      '/extension/inspect-interfaces.tcl',
      { PLATFORM_CONFIG: 'WHC' },
    )).toEqual([
      'set ::PLATFORM_CONFIG "WHC"',
      'source "/work/quartus/video.tcl"',
      'save_system "/tmp/evaluated.qsys"',
      'source "/extension/inspect-interfaces.tcl"',
      '',
    ].join('\n'));
  });
});

describe('platformDesignerTemporaryPrefix', () => {
  it('places a Quartus-safe generated folder beside the source Tcl file', () => {
    expect(platformDesignerTemporaryPrefix('/work/quartus/video.tcl')).toBe(
      '/work/quartus/qsys_view_video_',
    );
    expect(platformDesignerTemporaryPrefix('/work/quartus/video-system.tcl')).toBe(
      '/work/quartus/qsys_view_video_system_',
    );
  });
});

describe('siblingQsysSearchPattern', () => {
  it('lets qsys-script resolve nested systems beside the parent design', () => {
    expect(siblingQsysSearchPattern('/work/quartus')).toBe('/work/quartus/*.qsys');
  });
});
