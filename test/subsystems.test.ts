// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { subsystemCandidatePaths } from '../src/subsystems';

describe('subsystemCandidatePaths', () => {
  it('prefers the same source format as the parent system', () => {
    expect(subsystemCandidatePaths('/work/platform1.qsys', 'platform2')).toEqual([
      '/work/platform2.qsys',
      '/work/platform2.tcl',
    ]);
    expect(subsystemCandidatePaths('/work/platform1.tcl', 'platform2')).toEqual([
      '/work/platform2.tcl',
      '/work/platform2.qsys',
    ]);
  });

  it('rejects module types that could escape the parent directory', () => {
    expect(subsystemCandidatePaths('/work/platform1.qsys', '../platform2')).toEqual([]);
  });
});
