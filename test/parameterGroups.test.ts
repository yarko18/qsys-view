// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { groupParameters } from '../webview/parameterGroups';

describe('groupParameters', () => {
  it('uses Quartus group and parameter order while retaining ungrouped values', () => {
    expect(groupParameters({
      MANUAL_FACTOR: '4',
      DATA_WIDTH: '16',
      ENABLED: '1',
    }, {
      ENABLED: { order: 0 },
      DATA_WIDTH: { group: 'Data format', order: 2 },
      MANUAL_FACTOR: { group: 'Advanced', order: 8 },
    })).toEqual([
      { entries: [['ENABLED', '1']] },
      { name: 'Data format', entries: [['DATA_WIDTH', '16']] },
      { name: 'Advanced', entries: [['MANUAL_FACTOR', '4']] },
    ]);
  });

  it('keeps the flat serialized order when Quartus groups are unavailable', () => {
    expect(groupParameters({ SECOND: '2', FIRST: '1' })).toEqual([
      { entries: [['SECOND', '2'], ['FIRST', '1']] },
    ]);
  });
});
