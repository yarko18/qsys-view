// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { parseEvaluatedHwTcl, parseHwTclStatic } from '../parser/hwTclParser';

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
    expect(graph.modules.map((module) => module.id)).toEqual(['source', 'sink']);
    expect(graph.component?.parameters[0]).toMatchObject({
      name: 'MODE',
      value: 'DIRECT',
      allowedValues: ['DIRECT', 'BYPASS'],
    });
    expect(graph.exportedInterfaces).toEqual({ din: 'source.in' });
    expect(graph.component?.exact).toBe(false);
  });

  it('shows elaborated ports and current values for a leaf component', () => {
    const graph = parseEvaluatedHwTcl(`
      set_module_property NAME leaf
      set_module_property DISPLAY_NAME {Leaf IP}
      add_parameter MODE STRING DIRECT
      set_parameter_property MODE ALLOWED_RANGES {{DIRECT:Direct path} {BYPASS:Bypass path}}
      qsys_view_component_value MODE BYPASS
      add_interface data_out avalon_streaming source
      set_interface_property data_out dataBitsPerSymbol 8
      add_interface_port data_out dout_data data Output 8
      qsys_view_component_mode leaf
    `, 'fallback');

    expect(graph.name).toBe('Leaf IP');
    expect(graph.modules.map((module) => module.id)).toEqual(['leaf']);
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
    expect(graph.metadata.source).toBe('tcl');
  });
});
