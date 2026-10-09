// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { classifyConnection, parseQsys } from '../parser/qsysParser';

const qsys = `<?xml version="1.0" encoding="UTF-8"?>
<system name="$\${FILENAME}">
  <module name="source" kind="video_source" version="1.0" enabled="1">
    <parameter name="WIDTH" value="1280" />
  </module>
  <module name="processing" kind="filter" version="1.0" enabled="0" />
  <module name="sink" kind="video_sink" version="1.0" enabled="1" />
  <connection kind="avalon_streaming" start="source.dout" end="processing.din" />
  <connection kind="avalon" start="source.control" end="sink.control">
    <parameter name="baseAddress" value="0x1000" />
  </connection>
  <connection kind="clock" start="missing.clk" end="sink.clk" />
</system>`;

describe('parseQsys', () => {
  it('parses modules, disabled state, parameters and typed connections', () => {
    const graph = parseQsys(qsys, 'video');
    expect(graph.name).toBe('video');
    expect(graph.modules).toHaveLength(3);
    expect(graph.modules[0]?.parameters.WIDTH).toBe('1280');
    expect(graph.modules[1]?.disabled).toBe(true);
    expect(graph.connections).toHaveLength(2);
    expect(graph.connections.map((connection) => connection.kind)).toEqual([
      'avalon_streaming',
      'avalon_memory_mapped',
    ]);
    expect(graph.connections[1]?.parameters.baseAddress).toBe('0x1000');
    expect(graph.warnings[0]).toContain('module not found');
  });

  it('uses a file fallback name when the system has no name', () => {
    expect(parseQsys('<system><module name="ip" kind="x" /></system>', 'demo').name).toBe('demo');
  });

  it('keeps exported interface mappings for hierarchy expansion', () => {
    const graph = parseQsys(`
      <system name="child">
        <interface name="din" internal="fifo.in" type="avalon_streaming" dir="end" />
        <module name="fifo" kind="fifo" enabled="1" />
      </system>
    `);

    expect(graph.exportedInterfaces).toEqual({ din: 'fifo.in' });
    expect(graph.exportedInterfaceMetadata).toEqual({
      din: {
        kind: 'avalon_streaming',
        rawKind: 'avalon_streaming',
        direction: 'end',
      },
    });
  });

  it('orients serialized interrupt connections from sender to receiver', () => {
    const graph = parseQsys(`
      <system name="irq-system">
        <module name="cpu" kind="nios" enabled="1" />
        <module name="timer" kind="timer" enabled="1" />
        <connection kind="interrupt" start="cpu.irq" end="timer.irq" />
      </system>
    `);

    expect(graph.connections[0]).toMatchObject({
      source: 'timer',
      sourcePort: 'irq',
      target: 'cpu',
      targetPort: 'irq',
      kind: 'interrupt',
    });
  });

  it('rejects malformed XML without a usable graph', () => {
    expect(() => parseQsys('<system><module', 'broken')).toThrow('Invalid Qsys XML');
  });

  it('accepts valid Qsys XML nested beyond the parser default', () => {
    const depth = 256;
    const nested = `${'<group>'.repeat(depth)}value${'</group>'.repeat(depth)}`;
    const graph = parseQsys(`
      <system name="deep-system">
        <module name="ip" kind="demo" />
        ${nested}
      </system>
    `);

    expect(graph.modules).toHaveLength(1);
  });

  it('reports the configured Qsys nesting limit', () => {
    const depth = 4097;
    const nested = `${'<group>'.repeat(depth)}value${'</group>'.repeat(depth)}`;

    expect(() => parseQsys(`<system>${nested}</system>`, 'too-deep.qsys'))
      .toThrow(/Invalid Qsys XML in too-deep\.qsys:.*4096/);
  });
});

describe('classifyConnection', () => {
  it.each([
    ['avalon_streaming', 'avalon_streaming'],
    ['avalon', 'avalon_memory_mapped'],
    ['clock', 'clock'],
    ['reset', 'reset'],
    ['interrupt', 'interrupt'],
    ['conduit', 'conduit'],
  ] as const)('maps %s to %s', (raw, expected) => {
    expect(classifyConnection(raw)).toBe(expected);
  });
});
