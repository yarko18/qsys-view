// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

export const connectionKinds = [
  'avalon_streaming',
  'avalon_memory_mapped',
  'clock',
  'reset',
  'interrupt',
  'conduit',
  'other',
] as const;

export type ConnectionKind = (typeof connectionKinds)[number];

export interface QsysPort {
  name: string;
  interfaceName: string;
  direction?: string;
  role?: string;
}

export interface QsysModule {
  id: string;
  name: string;
  type: string;
  disabled: boolean;
  parameters: Record<string, string>;
  ports: QsysPort[];
}

export interface QsysConnection {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  kind: ConnectionKind;
  rawKind: string;
}

export interface QsysGraph {
  name: string;
  modules: QsysModule[];
  connections: QsysConnection[];
  warnings: string[];
}
