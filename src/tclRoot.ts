// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import path from 'node:path';

export function isPathWithin(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === ''
    || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function platformIpRoot(sourcePath: string): string | undefined {
  const normalized = path.resolve(sourcePath).replaceAll('\\', '/');
  const match = /^(.*\/quartus\/platform\/ip)(?:\/|$)/i.exec(normalized);
  return match?.[1] ? path.normalize(match[1]) : undefined;
}

/**
 * Chooses a safe boundary that still contains shared Platform Designer IP
 * helpers. Nested IP repositories commonly source a sibling `common`
 * repository under `quartus/platform/ip`; VS Code otherwise returns only the
 * most specific nested workspace folder and rejects that valid dependency.
 */
export function tclAllowedRoot(sourcePath: string, workspaceRoots: readonly string[]): string {
  const candidates = workspaceRoots.filter((root) => isPathWithin(root, sourcePath));
  const ipRoot = platformIpRoot(sourcePath);
  if (ipRoot) candidates.push(ipRoot);
  if (candidates.length === 0) return path.dirname(path.resolve(sourcePath));
  return candidates
    .map((candidate) => path.resolve(candidate))
    .sort((left, right) => left.length - right.length)[0]!;
}
