// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { parseEvaluatedQsysTcl } from '../parser/qsysTclEvaluation';

describe('parseEvaluatedQsysTcl', () => {
  it('uses the executed Qsys topology and parameter values instead of the static Tcl graph', () => {
    const graph = parseEvaluatedQsysTcl(`
      <system name="video">
        <module name="cvi" kind="LynredCVI" enabled="1">
          <parameter name="CORE_TYPE" value="target_1" />
          <parameter name="MAX_WIDTH" value="1280" />
        </module>
        <module name="sink" kind="video_sink" enabled="1" />
        <connection name="video_link" kind="avalon_streaming" start="cvi.dout" end="sink.din" />
      </system>
    `, 'fallback', [
      'QSYS_VIEWER\tINTERFACE\tcvi\tdout\tavalon_streaming source',
      'QSYS_VIEWER\tINTERFACE\tsink\tdin\tavalon_streaming sink',
    ].join('\n'), '/quartus/qsys-script');

    expect(graph.modules.find((module) => module.id === 'cvi')?.parameters).toMatchObject({
      CORE_TYPE: 'target_1',
      MAX_WIDTH: '1280',
    });
    expect(graph.connections).toContainEqual(expect.objectContaining({
      id: 'video_link',
      source: 'cvi',
      target: 'sink',
      kind: 'avalon_streaming',
    }));
    expect(graph.metadata.source).toBe('quartus');
  });
});
