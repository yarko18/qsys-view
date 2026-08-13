// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { QsysComponentMetadata } from '../parser/graph';
import { componentDefinitionExports } from '../webview/componentInterfaces';
import type { ExportedInterface } from '../webview/exportedInterfaces';

const din: ExportedInterface = {
  name: 'din',
  endpoint: 'video.din',
  moduleId: 'video',
  port: 'din',
  kind: 'avalon_streaming',
  rawKind: 'avalon_streaming',
  direction: 'sink',
  side: 'input',
};

const component: QsysComponentMetadata = {
  source: 'hw-tcl',
  exact: true,
  mode: 'leaf',
  moduleId: 'video',
  parameters: [],
  files: [],
  externalInterfaces: [{
    name: 'din',
    kind: 'avalon_streaming',
    rawKind: 'avalon_streaming',
    direction: 'sink',
    parameters: {},
    ports: [
      { name: 'din_valid', role: 'valid', direction: 'Input', width: 1 },
      { name: 'din_data', role: 'data', direction: 'Input', width: 24 },
      { name: 'din_ready', role: 'ready', direction: 'Output', width: 1 },
    ],
  }],
};

describe('component canvas interfaces', () => {
  it('uses one row while collapsed and one row per physical signal while expanded', () => {
    const collapsed = componentDefinitionExports([din], component, new Set());
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({ displayName: 'din', expandable: true });

    const expanded = componentDefinitionExports([din], component, new Set(['din']));
    expect(expanded.map((item) => item.displayName)).toEqual([
      'din.valid',
      'din.data',
      'din.ready',
    ]);
    expect(new Set(expanded.map((item) => item.anchorPort)).size).toBe(3);
    expect(expanded.at(-1)?.signal).toMatchObject({
      name: 'din_ready',
      direction: 'Output',
    });
  });
});
