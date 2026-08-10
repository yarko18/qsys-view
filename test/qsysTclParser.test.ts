// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQsys } from '../parser/qsysParser';
import { parseQsysTcl } from '../parser/qsysTclParser';

describe('parseQsysTcl', () => {
  it('parses the exported example without evaluating Tcl', () => {
    const source = readFileSync(new URL('../example/platform.tcl', import.meta.url), 'utf8');
    const graph = parseQsysTcl(source, 'fallback');

    expect(graph.name).toBe('platform');
    expect(graph.modules).toHaveLength(26);
    expect(graph.connections).toHaveLength(95);
    expect(graph.modules.find((module) => module.id === 'sc_fifo_0')?.parameters.FIFO_DEPTH).toBe('16');
    expect(graph.diagnostics).toEqual([]);
    expect(graph.connections.find((connection) =>
      connection.source === 'mm_bridge' && connection.target === 'clipper',
    )).toMatchObject({
      kind: 'avalon_memory_mapped',
      rawKind: 'avalon_memory_mapped',
      parameters: { baseAddress: '0x00080400' },
    });
  });

  it('supports braced, quoted, nested and escaped words', () => {
    const graph = parseQsysTcl(String.raw`
      create_system "demo system"
      add_instance {source} {source_type} 1.0
      set_instance_parameter_value source {DESCRIPTION} {nested {value}}
      set_instance_parameter_value source LABEL "hello\ world"
      add_instance sink sink_type 1.0
      add_connection source.out sink.in
      set_connection_parameter_value {source.out/sink.in} {baseAddress} {0x20}
    `);

    expect(graph.name).toBe('demo system');
    expect(graph.modules[0]?.parameters).toMatchObject({
      DESCRIPTION: 'nested {value}',
      LABEL: 'hello world',
    });
    expect(graph.connections[0]?.parameters.baseAddress).toBe('0x20');
    expect(graph.connections[0]?.kind).toBe('avalon_memory_mapped');
  });

  it('infers Avalon-MM only from characteristic connection parameters', () => {
    const graph = parseQsysTcl(`
      add_instance master bridge 1.0
      add_instance addressed peripheral 1.0
      add_instance plain unknown 1.0
      add_connection master.m0 addressed.s0
      set_connection_parameter_value master.m0/addressed.s0 arbitrationPriority 1
      add_connection master.m1 plain.s0
    `);

    expect(graph.connections).toMatchObject([
      { kind: 'avalon_memory_mapped', rawKind: 'avalon_memory_mapped' },
      { kind: 'other', rawKind: 'unknown (static Tcl)' },
    ]);
  });

  it('uses explicit connection kinds and exported interface declarations', () => {
    const graph = parseQsysTcl(`
      create_system demo
      add_instance source source_type 1.0
      add_instance conduit_sink conduit_type 1.0
      add_instance stream_sink stream_type 1.0
      add_interface stream_out avalon_streaming source
      add_interface_port stream_out data data Output 24
      set_interface_property stream_out EXPORT_OF source.out
      add_connection source.out stream_sink.in
      add_connection source.status conduit_sink.status conduit status_link
    `);

    expect(graph.connections).toMatchObject([
      { id: 'tcl:source.out->stream_sink.in', kind: 'avalon_streaming', rawKind: 'avalon_streaming' },
      { id: 'status_link', kind: 'conduit', rawKind: 'conduit' },
    ]);
    expect(graph.exportedInterfaces).toEqual({ stream_out: 'source.out' });
    expect(graph.exportedInterfaceMetadata).toEqual({
      stream_out: {
        kind: 'avalon_streaming',
        rawKind: 'avalon_streaming',
        direction: 'source',
      },
    });
    expect(graph.modules.find((module) => module.id === 'source')?.ports)
      .toContainEqual(expect.objectContaining({ interfaceName: 'out' }));
    expect(graph.warnings.join('\n')).not.toContain('add_interface');
  });

  it('builds the same internal topology as Qsys when Tcl connection kinds are explicit', () => {
    const qsys = parseQsys(`
      <system name="demo">
        <module name="source" kind="source_type" enabled="1" />
        <module name="sink" kind="sink_type" enabled="1" />
        <connection name="stream" kind="avalon_streaming" start="source.out" end="sink.in">
          <parameter name="latency" value="1" />
        </connection>
      </system>
    `);
    const tcl = parseQsysTcl(`
      create_system demo
      add_instance source source_type 1.0
      add_instance sink sink_type 1.0
      add_connection source.out sink.in avalon_streaming stream
      set_connection_parameter_value source.out/sink.in latency 1
    `);

    expect(tcl.modules.map(({ id, type }) => ({ id, type }))).toEqual(
      qsys.modules.map(({ id, type }) => ({ id, type })),
    );
    expect(tcl.connections).toEqual(qsys.connections);
  });

  it('orients explicit interrupt connections from sender to receiver', () => {
    const graph = parseQsysTcl(`
      add_instance cpu nios 1.0
      add_instance timer timer 1.0
      add_connection cpu.irq timer.irq interrupt timer_irq
    `);

    expect(graph.connections[0]).toMatchObject({
      id: 'timer_irq',
      source: 'timer',
      target: 'cpu',
      kind: 'interrupt',
    });
  });

  it('warns about dynamic Tcl instead of pretending to evaluate it', () => {
    const graph = parseQsysTcl(`
      set instance_name source
      add_instance $instance_name source_type 1.0
      foreach item {a b} { add_instance $item type 1.0 }
    `);

    expect(graph.modules).toHaveLength(0);
    expect(graph.warnings.join('\n')).toContain('Skipped dynamic');
    expect(graph.warnings.join('\n')).toContain('foreach');
    expect(graph.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      command: 'foreach',
      line: 4,
    }));
  });

  it('keeps an instance whose version is supplied through a Tcl variable', () => {
    const graph = parseQsysTcl('add_instance core core_ip $componentVersion');

    expect(graph.modules).toContainEqual(expect.objectContaining({ id: 'core', type: 'core_ip' }));
  });

  it('reports misspelled Platform Designer commands as line diagnostics', () => {
    const graph = parseQsysTcl(`
      add_instance fir fir_type 1.0
      add_instance clipper clipper_type 1.0
      add_nection fir.dout clipper.din
    `);

    expect(graph.diagnostics).toContainEqual({
      severity: 'error',
      message: 'Unknown Platform Designer command “add_nection”. Did you mean “add_connection”?',
      line: 4,
      command: 'add_nection',
    });
  });

  it('keeps unparsed Platform Designer commands as warnings rather than assumed errors', () => {
    const graph = parseQsysTcl(`
      add_instance source source_type 1.0
      set_instance_property source SOME_PROPERTY true
    `);

    expect(graph.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      command: 'set_instance_property',
    }));
  });

  it('points missing-instance parameter warnings to the first parameter line', () => {
    const graph = parseQsysTcl([
      'add_instance clipper alt_vip_cl_clp 23.1',
      'set_instance_parameter_value cliper {BITS_PER_SYMBOL} {16}',
      'set_instance_parameter_value cliper {NUMBER_OF_COLOR_PLANES} {3}',
    ].join('\n'));

    expect(graph.diagnostics).toContainEqual({
      severity: 'warning',
      message: 'Parameters refer to missing instance cliper.',
      line: 2,
    });
  });

  it('does not warn when parameters appear before their instance declaration', () => {
    const graph = parseQsysTcl([
      'set_instance_parameter_value clipper {BITS_PER_SYMBOL} {16}',
      'add_instance clipper alt_vip_cl_clp 23.1',
    ].join('\n'));

    expect(graph.modules[0]?.parameters.BITS_PER_SYMBOL).toBe('16');
    expect(graph.diagnostics?.map((diagnostic) => diagnostic.message).join('\n'))
      .not.toContain('missing instance');
  });

  it('rejects malformed Tcl words with a useful line number', () => {
    expect(() => parseQsysTcl('add_instance {broken type 1.0')).toThrow(/line 1.*unmatched brace/i);
  });

  it('keeps unnamed connection identities stable when an earlier connection is removed', () => {
    const prefix = `
      add_instance source source_type 1.0
      add_instance middle middle_type 1.0
      add_instance sink sink_type 1.0
    `;
    const original = parseQsysTcl(`${prefix}
      add_connection source.out middle.in
      add_connection middle.out sink.in
    `);
    const changed = parseQsysTcl(`${prefix}
      add_connection middle.out sink.in
    `);

    expect(original.connections[1]?.id).toBe('tcl:middle.out->sink.in');
    expect(changed.connections[0]?.id).toBe(original.connections[1]?.id);
  });

  it('gives duplicate unnamed connections unique deterministic identities', () => {
    const graph = parseQsysTcl(`
      add_instance source source_type 1.0
      add_instance sink sink_type 1.0
      add_connection source.out sink.in
      add_connection source.out sink.in
    `);

    expect(graph.connections.map((connection) => connection.id)).toEqual([
      'tcl:source.out->sink.in',
      'tcl:source.out->sink.in#2',
    ]);
  });
});
