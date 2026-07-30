// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseQsysTcl } from '../parser/qsysTclParser';
import { extractStaticTclTrace, traceQsysTcl } from '../src/staticTcl';

const tclsh = process.platform === 'win32' ? 'tclsh.exe' : 'tclsh';
const tclshAvailable = !spawnSync(tclsh, [], { input: 'exit 0\n' }).error;

describe('extractStaticTclTrace', () => {
  it('decodes traced Tcl lists and ignores ordinary script output', () => {
    const command = Buffer.from('set_instance_parameter_value cvi MAX_WIDTH 1280').toString('base64');
    expect(extractStaticTclTrace(`ordinary output\nQSYS_VIEW_TRACE\t${command}\n`)).toBe(
      'set_instance_parameter_value cvi MAX_WIDTH 1280',
    );
  });
});

describe.skipIf(!tclshAvailable)('traceQsysTcl', () => {
  it('safely resolves source, namespaces, procedures, foreach, substitutions, and switch', async () => {
    const testDirectory = fileURLToPath(new URL('.', import.meta.url));
    const controllerPath = fileURLToPath(new URL('../quartus/trace-system.tcl', import.meta.url));
    const sourcePath = fileURLToPath(new URL('./static-entry.tcl', import.meta.url));
    const trace = await traceQsysTcl({
      executable: tclsh,
      controllerPath,
      sourcePath,
      allowedRoot: fileURLToPath(new URL('..', import.meta.url)),
      source: `
        source [file join [file dirname [info script]] fixtures static-config.tcl]
        package require -exact qsys 16.0
        create_system video
        add_instance cvi LynredCVI 1.0
        foreach {parameter value} [::testcfg::cvi_params] {
          set_instance_parameter_value cvi $parameter $value
        }
        add_instance whc_sink sink 1.0
        add_instance wtc_sink sink 1.0
        switch -- $::testcfg::PRODUCT {
          WHC { add_connection cvi.dout whc_sink.din }
          WTC { add_connection cvi.dout wtc_sink.din }
        }
      `,
      variables: { PLATFORM_CONFIG: 'WTC' },
    });
    expect(testDirectory).toBeTruthy();
    const graph = parseQsysTcl(trace);
    expect(graph.modules.find((module) => module.id === 'cvi')?.parameters).toMatchObject({
      CORE_TYPE: 'WTC',
      MAX_WIDTH: '640',
    });
    expect(graph.connections).toHaveLength(1);
    expect(graph.connections[0]).toMatchObject({ source: 'cvi', target: 'wtc_sink' });
  });
});
