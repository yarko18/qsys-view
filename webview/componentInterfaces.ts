// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import type { QsysComponentMetadata, QsysInterfacePort } from '../parser/graph';
import type { ExportedInterface } from './exportedInterfaces';

export interface VisibleSystemExport extends ExportedInterface {
  /** Synthetic layout port used when one logical interface is expanded to signals. */
  anchorPort: string;
  displayName: string;
  componentInterface?: string;
  expandable: boolean;
  signal?: QsysInterfacePort;
  firstSignal?: boolean;
}

/** Converts a component's logical exported interfaces to one or more canvas rows. */
export function componentDefinitionExports(
  exports: readonly ExportedInterface[],
  component: QsysComponentMetadata | undefined,
  expandedInterfaces: ReadonlySet<string>,
): VisibleSystemExport[] {
  return exports.flatMap((item) => {
    const iface = component?.externalInterfaces.find((candidate) => candidate.name === item.name);
    const expandable = Boolean(iface?.ports.length);
    const expanded = Boolean(expandable && expandedInterfaces.has(item.name));
    if (!expanded || !iface) {
      return [{
        ...item,
        anchorPort: item.port,
        displayName: item.name,
        componentInterface: iface ? item.name : undefined,
        expandable,
      }];
    }
    return iface.ports.map((signal, index) => {
      const signalName = signal.role || signal.name || `signal_${index}`;
      return {
        ...item,
        anchorPort: `${item.port}::${signalName}::${index}`,
        displayName: `${item.name}.${signalName}`,
        componentInterface: item.name,
        expandable: true,
        signal,
        firstSignal: index === 0,
      };
    });
  });
}
