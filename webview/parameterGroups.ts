// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysParameterMetadata } from '../parser/graph';

export interface ParameterGroup {
  name?: string;
  entries: Array<[string, string]>;
}

/** Groups configured parameters using the order and GROUP reported by Quartus. */
export function groupParameters(
  parameters: Record<string, string>,
  metadata?: Record<string, QsysParameterMetadata>,
): ParameterGroup[] {
  const entries = Object.entries(parameters).map((entry, index) => ({ entry, index }));
  entries.sort((left, right) => {
    const leftOrder = metadata?.[left.entry[0]]?.order;
    const rightOrder = metadata?.[right.entry[0]]?.order;
    if (leftOrder !== undefined && rightOrder !== undefined && leftOrder !== rightOrder) return leftOrder - rightOrder;
    if (leftOrder !== undefined && rightOrder === undefined) return -1;
    if (leftOrder === undefined && rightOrder !== undefined) return 1;
    return left.index - right.index;
  });

  if (!entries.some(({ entry }) => Boolean(metadata?.[entry[0]]?.group))) {
    return entries.length > 0 ? [{ entries: entries.map(({ entry }) => entry) }] : [];
  }

  const grouped = new Map<string, Array<[string, string]>>();
  for (const { entry } of entries) {
    const group = metadata?.[entry[0]]?.group ?? '';
    const groupEntries = grouped.get(group) ?? [];
    groupEntries.push(entry);
    grouped.set(group, groupEntries);
  }
  return [...grouped].map(([name, groupEntries]) => ({
    ...(name ? { name } : {}),
    entries: groupEntries,
  }));
}
