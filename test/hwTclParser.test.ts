// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { parseEvaluatedHwTcl, parseHwTclStatic } from '../parser/hwTclParser';
import { composeHierarchy } from '../webview/hierarchy';

describe('Platform Designer hardware Tcl components', () => {
  it('builds a useful non-executing preview from a composition callback', () => {
    const graph = parseHwTclStatic(`
      set_module_property NAME demo
      set_module_property DISPLAY_NAME "Demo component"
      set_module_property COMPOSITION_CALLBACK compose
      add_parameter MODE STRING DIRECT
      set_parameter_property MODE ALLOWED_RANGES {DIRECT BYPASS}
      proc compose {} {
        global componentVersion
        add_instance source source_ip $componentVersion
        add_instance sink sink_ip 1.0
        add_connection source.out sink.in avalon_streaming
        add_interface din avalon_streaming sink
        set_interface_property din EXPORT_OF source.in
      }
    `, 'fallback');

    expect(graph.name).toBe('Demo component');
    expect(graph.modules.map((module) => module.id)).toEqual(['demo']);
    expect(graph.component?.mode).toBe('composition');
    expect(graph.component?.composition?.modules.map((module) => module.id)).toEqual(['source', 'sink']);
    expect(graph.component?.composition?.connections).toHaveLength(1);
    expect(graph.component?.parameters[0]).toMatchObject({
      name: 'MODE',
      value: 'DIRECT',
      allowedValues: ['DIRECT', 'BYPASS'],
    });
    expect(graph.exportedInterfaces).toEqual({ din: 'demo.din' });
    expect(graph.component?.composition?.exportedInterfaces).toEqual({ din: 'source.in' });
    expect(graph.component?.exact).toBe(false);

    const expanded = composeHierarchy(graph, new Map([
      [graph.component!.moduleId, graph.component!.composition!],
    ]));
    expect(expanded.modules.map((module) => module.id)).toEqual(['demo/source', 'demo/sink']);
    expect(expanded.exportedInterfaces).toEqual({ din: 'demo/source.in' });
  });

  it('shows elaborated ports and current values for a leaf component', () => {
    const graph = parseEvaluatedHwTcl(`
      set_module_property NAME leaf
      set_module_property DISPLAY_NAME {Leaf IP}
      add_parameter MODE STRING DIRECT
      set_parameter_property MODE ALLOWED_RANGES {{DIRECT:Direct path} {BYPASS:Bypass path}}
      qsys_view_component_value MODE BYPASS
      qsys_view_component_file_registration /workspace/common/files.tcl {add_static_sv_file wip_pkg.sv ../common/wip/packages wip_pkg} {add_wip_common_pkg_files add_pkg_sv_file}
      qsys_view_component_file_registration /workspace/common/files.tcl {add_static_sv_file leaf.sv .} {}
      add_fileset synth_fileset QUARTUS_SYNTH {}
      add_fileset_file leaf/wip_pkg.sv SYSTEM_VERILOG PATH ../common/wip/packages/wip_pkg.sv
      add_fileset_file leaf/leaf.sv SYSTEM_VERILOG PATH ./leaf.sv
      add_fileset sim_verilog_fileset SIM_VERILOG {}
      add_fileset_file leaf/wip_pkg.sv SYSTEM_VERILOG PATH ../common/wip/packages/wip_pkg.sv MENTOR_SPECIFIC
      set_fileset_file_attribute leaf/wip_pkg.sv COMMON_SYSTEMVERILOG_PACKAGE wip_pkg
      add_fileset_file leaf/leaf.sv SYSTEM_VERILOG PATH ./leaf.sv MENTOR_SPECIFIC
      add_interface data_out avalon_streaming source
      set_interface_property data_out dataBitsPerSymbol 8
      add_interface_port data_out dout_data data Output 8
      qsys_view_component_mode leaf
    `, 'fallback');

    expect(graph.name).toBe('Leaf IP');
    expect(graph.modules.map((module) => module.id)).toEqual(['leaf']);
    expect(graph.component?.mode).toBe('leaf');
    expect(graph.component?.composition).toBeUndefined();
    expect(graph.exportedInterfaces).toEqual({ data_out: 'leaf.data_out' });
    expect(graph.component?.parameters[0]).toMatchObject({
      value: 'BYPASS',
      allowedValues: ['DIRECT', 'BYPASS'],
    });
    expect(graph.component?.externalInterfaces[0]?.ports[0]).toMatchObject({
      name: 'dout_data',
      role: 'data',
      direction: 'Output',
      width: 8,
    });
    expect(graph.component?.files).toEqual([
      expect.objectContaining({
        path: '../common/wip/packages/wip_pkg.sv',
        origin: 'add_wip_common_pkg_files',
        filesets: ['QUARTUS_SYNTH', 'SIM_VERILOG'],
        tags: ['MENTOR_SPECIFIC'],
        attributes: { COMMON_SYSTEMVERILOG_PACKAGE: 'wip_pkg' },
      }),
      expect.objectContaining({
        path: 'leaf.sv',
        filesets: ['QUARTUS_SYNTH', 'SIM_VERILOG'],
      }),
    ]);
    expect(graph.metadata.source).toBe('tcl');
  });

  it('keeps static exports and files when a composition callback stops early', () => {
    const fallback = parseHwTclStatic(`
      set_module_property NAME partial
      set_module_property COMPOSITION_CALLBACK compose
      proc compose {} {
        add_instance source source_ip 1.0
        add_instance sink sink_ip 1.0
        add_connection source.out sink.in avalon_streaming
        add_interface din avalon_streaming sink
        set_interface_property din EXPORT_OF source.in
      }
    `, 'fallback');
    const graph = parseEvaluatedHwTcl(`
      set_module_property NAME partial
      set_module_property COMPOSITION_CALLBACK compose
      qsys_view_component_file_registration /workspace/common/files.tcl {add_static_sv_file shared_pkg.sv ../common/packages shared_pkg} {add_shared_pkg_files add_pkg_sv_file}
      add_instance source source_ip 1.0
      qsys_view_component_callback_error COMPOSITION_CALLBACK {can't read "missing_value": no such variable}
      qsys_view_component_mode composition
    `, 'fallback', fallback);

    expect(graph.component?.exact).toBe(false);
    expect(graph.component?.mode).toBe('composition');
    expect(graph.component?.composition?.modules.map((module) => module.id)).toEqual(['source', 'sink']);
    expect(graph.component?.composition?.connections).toHaveLength(1);
    expect(graph.exportedInterfaces).toEqual({ din: 'partial.din' });
    expect(graph.component?.externalInterfaces[0]).toMatchObject({
      name: 'din',
      exportOf: 'source.in',
    });
    expect(graph.component?.files).toEqual([
      expect.objectContaining({
        path: '../common/packages/shared_pkg.sv',
        origin: 'add_shared_pkg_files',
        filesets: [],
      }),
    ]);
    expect(graph.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      message: expect.stringContaining('missing_value'),
    }));
  });
});
