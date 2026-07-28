// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQsysTcl } from '../parser/qsysTclParser';

describe('parseQsysTcl', () => {
  it('parses the exported example without evaluating Tcl', () => {
    const source = readFileSync(new URL('../example/platform.tcl', import.meta.url), 'utf8');
    const graph = parseQsysTcl(source, 'fallback');

    expect(graph.name).toBe('platform');
    expect(graph.modules).toHaveLength(26);
    expect(graph.connections).toHaveLength(95);
    expect(graph.modules.find((module) => module.id === 'sc_fifo_0')?.parameters.FIFO_DEPTH).toBe('16');
    expect(graph.connections.every((connection) => connection.kind === 'other')).toBe(true);
    expect(graph.connections.find((connection) =>
      connection.source === 'mm_bridge' && connection.target === 'clipper',
    )?.parameters.baseAddress).toBe('0x00080400');
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
  });

  it('rejects malformed Tcl words with a useful line number', () => {
    expect(() => parseQsysTcl('add_instance {broken type 1.0')).toThrow(/line 1.*unmatched brace/i);
  });
});
