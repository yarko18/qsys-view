// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPathWithin, tclAllowedRoot } from '../src/tclRoot';

describe('safe Tcl source root', () => {
  const component = path.join(
    path.sep,
    'projects',
    'target_1',
    'quartus',
    'platform',
    'ip',
    'symbol_adapter',
    'src',
    'video',
    'adapter_hw.tcl',
  );

  it('widens a nested IP workspace to the shared platform IP directory', () => {
    expect(tclAllowedRoot(component, [
      path.join(path.sep, 'projects', 'target_1', 'quartus', 'platform', 'ip', 'symbol_adapter'),
    ])).toBe(path.join(path.sep, 'projects', 'target_1', 'quartus', 'platform', 'ip'));
  });

  it('retains a broader explicitly opened workspace', () => {
    expect(tclAllowedRoot(component, [
      path.join(path.sep, 'projects', 'target_1'),
      path.join(path.sep, 'projects', 'target_1', 'quartus', 'platform', 'ip', 'symbol_adapter'),
    ])).toBe(path.join(path.sep, 'projects', 'target_1'));
  });

  it('limits clickable registered files to the selected source tree', () => {
    const root = path.join(path.sep, 'projects', 'target_1', 'quartus', 'platform', 'ip');
    expect(isPathWithin(root, path.join(root, 'common', 'wip_pkg.sv'))).toBe(true);
    expect(isPathWithin(root, path.join(path.sep, 'projects', 'private.txt'))).toBe(false);
  });
});
