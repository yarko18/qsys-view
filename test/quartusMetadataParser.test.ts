// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { parseQsys } from '../parser/qsysParser';
import { parseQsysTcl } from '../parser/qsysTclParser';
import { applyQuartusMetadata } from '../parser/quartusMetadataParser';

const qsys = `<system><module name="source" kind="source_ip"/><module name="sink" kind="sink_ip"/><connection kind="avalon_streaming" start="source.out" end="sink.in"/></system>`;

describe('applyQuartusMetadata', () => {
  it('parses exact interface parameters and elaborated ports', () => {
    const output = [
      'ordinary Quartus output',
      'QSYS_VIEWER\tINTERFACE\tsource\tout\tavalon_streaming_source',
      'QSYS_VIEWER\tPARAMETER\tsource\tout\tsymbolsPerBeat\t2',
      'QSYS_VIEWER\tPORT\tsource\tout\tdata\tdata\tOutput\t16',
      'QSYS_VIEWER\tPORT\tsource\tout\tvalid\tvalid\tOutput\t1',
      'QSYS_VIEWER\tINTERFACE\tsink\tin\tavalon_streaming_sink',
      'QSYS_VIEWER\tPORT\tsink\tin\tdata\tdata\tInput\t16',
    ].join('\n');
    const graph = applyQuartusMetadata(parseQsys(qsys), output, '/quartus/qsys-script');

    expect(graph.metadata.source).toBe('quartus');
    expect(graph.interfaces['source.out']?.parameters.symbolsPerBeat).toBe('2');
    expect(graph.interfaces['source.out']?.ports).toContainEqual({
      name: 'data', role: 'data', direction: 'Output', width: 16,
    });
    expect(graph.interfaces['source.out']?.kind).toBe('avalon_streaming_source');
    expect(graph.connections[0]?.kind).toBe('avalon_streaming');
  });

  it('fails rather than inventing metadata when Quartus returns no records', () => {
    expect(() => applyQuartusMetadata(parseQsys(qsys), 'Quartus log only', 'qsys-script'))
      .toThrow(/no elaborated interfaces/i);
  });

  it('resolves static Tcl connection kinds from elaborated interface classes', () => {
    const tcl = `
      create_system demo
      add_instance source source_ip 1.0
      add_instance sink sink_ip 1.0
      add_connection source.out sink.in
    `;
    const output = [
      'QSYS_VIEWER\tINTERFACE\tsource\tout\tavalon_streaming_source',
      'QSYS_VIEWER\tINTERFACE\tsink\tin\tavalon_streaming_sink',
    ].join('\n');

    const graph = applyQuartusMetadata(parseQsysTcl(tcl), output, 'qsys-script');
    expect(graph.connections[0]).toMatchObject({
      kind: 'avalon_streaming',
      rawKind: 'avalon_streaming_source',
    });
  });
});
