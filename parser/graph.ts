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
  source: 'quartus' | 'tcl';
}

export interface QsysExportedInterfaceMetadata {
  kind: ConnectionKind;
  rawKind: string;
  direction: string;
}

export interface QsysMetadataStatus {
  source: 'quartus' | 'tcl' | 'qsys-only';
  label: string;
  path?: string;
}

export type QsysDiagnosticSeverity = 'error' | 'warning';

export interface QsysDiagnostic {
  severity: QsysDiagnosticSeverity;
  message: string;
  line?: number;
  command?: string;
}

export interface QsysParameterMetadata {
  group?: string;
  order: number;
}

export interface QsysComponentParameter {
  name: string;
  type: string;
  value: string;
  defaultValue: string;
  enabled: boolean;
  visible: boolean;
  derived: boolean;
  valid: boolean;
  displayName?: string;
  description?: string;
  group?: string;
  displayHint?: string;
  allowedValues?: string[];
  range?: string;
}

export interface QsysComponentInterface {
  name: string;
  kind: ConnectionKind;
  rawKind: string;
  direction: string;
  parameters: Record<string, string>;
  ports: QsysInterfacePort[];
  exportOf?: string;
}

export interface QsysComponentMetadata {
  source: 'hw-tcl';
  exact: boolean;
  kind?: string;
  version?: string;
  parameters: QsysComponentParameter[];
  externalInterfaces: QsysComponentInterface[];
}

export interface QsysModule {
  id: string;
  name: string;
  type: string;
  disabled: boolean;
  parameters: Record<string, string>;
  parameterMetadata?: Record<string, QsysParameterMetadata>;
  ports: QsysPort[];
  subsystem?: QsysSubsystemReference;
  hierarchyPath?: string[];
}

export interface QsysSubsystemReference {
  resource: string;
  format: 'qsys' | 'tcl';
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
  diagnostics?: QsysDiagnostic[];
  exportedInterfaces?: Record<string, string>;
  exportedInterfaceMetadata?: Record<string, QsysExportedInterfaceMetadata>;
  /** Present when the graph was opened from a Platform Designer *_hw.tcl component. */
  component?: QsysComponentMetadata;
  /** Maps equivalent clock/reset source endpoints across expanded subsystem boundaries. */
  domainAliases?: Record<string, string>;
}
