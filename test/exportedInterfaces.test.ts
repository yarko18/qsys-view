// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { parseQsysTcl } from '../parser/qsysTclParser';
import { collectExportedInterfaces } from '../webview/exportedInterfaces';

describe('exported system interfaces', () => {
  it('keeps source and sink exports on their signal-flow sides before Quartus analysis', () => {
    const graph = parseQsysTcl(`
      add_instance source source_ip 1.0
      add_instance sink sink_ip 1.0
      add_interface video_out avalon_streaming source
      set_interface_property video_out EXPORT_OF source.dout_10
      add_interface video_in avalon_streaming sink
      set_interface_property video_in EXPORT_OF sink.din_2
    `);

    expect(collectExportedInterfaces(graph)).toMatchObject([
      {
        name: 'video_out',
        endpoint: 'source.dout_10',
        kind: 'avalon_streaming',
        side: 'output',
      },
      {
        name: 'video_in',
        endpoint: 'sink.din_2',
        kind: 'avalon_streaming',
        side: 'input',
      },
    ]);
  });
});
