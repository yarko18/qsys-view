// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseEvaluatedHwTcl } from '../parser/hwTclParser';
import { parseQsysTcl } from '../parser/qsysTclParser';
import { extractStaticTclTrace, traceHwTcl, traceQsysTcl } from '../src/staticTcl';

const tclsh = process.platform === 'win32' ? 'tclsh.exe' : 'tclsh';
const tclshAvailable = !spawnSync(tclsh, [], { input: 'exit 0\n' }).error;

describe('extractStaticTclTrace', () => {
  it('decodes traced Tcl lists and ignores ordinary script output', () => {
    const command = Buffer.from('set_instance_parameter_value cvi MAX_WIDTH 1280').toString('base64');
    expect(extractStaticTclTrace(`ordinary output\nQSYS_VIEW_TRACE\t${command}\n`)).toBe(
      'set_instance_parameter_value cvi MAX_WIDTH 1280',
    );
  });

  it('does not start Tcl work when the request is already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(traceQsysTcl({
      executable: 'an-executable-that-must-not-be-started',
      controllerPath: 'controller.tcl',
      sourcePath: 'source.tcl',
      allowedRoot: '.',
      source: '',
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
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

  it('elaborates a hardware component again with parameter overrides', async () => {
    const controllerPath = fileURLToPath(new URL('../quartus/trace-component.tcl', import.meta.url));
    const sourcePath = fileURLToPath(new URL('./dynamic_component_hw.tcl', import.meta.url));
    const options = {
      executable: tclsh,
      controllerPath,
      sourcePath,
      allowedRoot: fileURLToPath(new URL('..', import.meta.url)),
      source: `
        package require -exact qsys 16.1
        set_module_property NAME dynamic_component
        set_module_property DISPLAY_NAME "Dynamic component"
        set_module_property COMPOSITION_CALLBACK compose
        add_parameter MODE STRING DIRECT
        set_parameter_property MODE ALLOWED_RANGES {DIRECT BYPASS}
        proc compose {} {
          set mode [get_parameter_value MODE]
          add_instance source source_ip 1.0
          add_instance sink sink_ip 1.0
          if {$mode eq "BYPASS"} {
            add_instance bypass bypass_ip 1.0
            add_connection source.out bypass.in avalon_streaming
            add_connection bypass.out sink.in avalon_streaming
          } else {
            add_connection source.out sink.in avalon_streaming
          }
          add_interface din avalon_streaming sink
          set_interface_property din EXPORT_OF source.in
        }
      `,
    };
    const direct = parseEvaluatedHwTcl(await traceHwTcl(options), 'fallback');
    const bypass = parseEvaluatedHwTcl(await traceHwTcl({ ...options, parameters: { MODE: 'BYPASS' } }), 'fallback');

    expect(direct.modules.map((module) => module.id)).toEqual(['dynamic_component']);
    expect(direct.component?.composition?.modules.map((module) => module.id)).toEqual(['source', 'sink']);
    expect(bypass.component?.composition?.modules.map((module) => module.id)).toEqual(['source', 'sink', 'bypass']);
    expect(bypass.component?.composition?.connections).toHaveLength(2);
    expect(bypass.component?.mode).toBe('composition');
    expect(bypass.component?.parameters[0]?.value).toBe('BYPASS');
    expect(bypass.component?.externalInterfaces[0]).toMatchObject({
      name: 'din',
      exportOf: 'source.in',
    });
    expect(bypass.metadata.source).toBe('tcl');
  });
});
