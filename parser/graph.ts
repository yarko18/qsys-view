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

export interface QsysInterfacePort {
  name: string;
  role: string;
  direction: string;
  width: number;
}

export interface QsysInterface {
  module: string;
  name: string;
  kind: string;
  parameters: Record<string, string>;
  ports: QsysInterfacePort[];
  source: 'quartus';
}

export interface QsysMetadataStatus {
  source: 'quartus' | 'qsys-only';
  label: string;
  path?: string;
}

export interface QsysModule {
  id: string;
  name: string;
  type: string;
  disabled: boolean;
  parameters: Record<string, string>;
  ports: QsysPort[];
}

export type QsysAdapterKind = 'timing' | 'data_format' | 'channel' | 'error';

export interface QsysAdapterDifference {
  property: string;
  source: string;
  target: string;
}

export interface QsysAdaptation {
  kind: QsysAdapterKind;
  differences: QsysAdapterDifference[];
}

export interface QsysConnection {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  kind: ConnectionKind;
  rawKind: string;
  parameters: Record<string, string>;
  adaptations?: QsysAdaptation[];
}

export interface QsysGraph {
  name: string;
  modules: QsysModule[];
  connections: QsysConnection[];
  interfaces: Record<string, QsysInterface>;
  metadata: QsysMetadataStatus;
  warnings: string[];
}
