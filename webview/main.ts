// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { connectionKinds, type ConnectionKind, type QsysAdaptation, type QsysComponentFile, type QsysComponentInterface, type QsysComponentParameter, type QsysConnection, type QsysDiagnostic, type QsysGraph, type QsysInterface, type QsysModule } from '../parser/graph';
import { streamParameters } from '../parser/streamMetadata';
import { createInterfaceWaveform } from '../parser/waveform';
import { groupParameters } from './parameterGroups';
import { connectionDiagnostics } from './connectionDiagnostics';
import { createConnectionFabricGraph, isConnectionFabricModule, type ConnectionFabric, type ConnectionFabricEndpoint } from './connectionFabrics';
import { activeConnections, disabledConnections, moduleConnections, visibleConnections } from './connectionVisibility';
import { exportedInterfaceStubLength, layoutAnchoredGraph, layoutGraph, layoutStableGraph, pathMidpoint, portAnchorY, projectVisibleLayout, separateHierarchyGroups, type LayoutExternalPort, type LayoutNode, type LayoutPoint, type LayoutResult, type StableLayoutCache } from '../layout/elk';
import { composeHierarchy, hierarchyBounds, type HierarchyBounds } from './hierarchy';
import { connectionAddress, createInterfaceHubs, type HubKind, type InterfaceHub } from './interfaceHubs';
import { availableConnectionKinds, canUsePipelineView, connectedModuleIds, inferClockResetConnections, inferSourceDomainConnectionKinds, isDirectKind, isHubKind, type GraphViewMode } from './viewMode';
import { collectExportedInterfaces } from './exportedInterfaces';
import { componentDefinitionExports, type VisibleSystemExport } from './componentInterfaces';
import './styles.css';

const vscode = acquireVsCodeApi();
const labels: Record<ConnectionKind, string> = {
  avalon_streaming: 'Avalon-ST',
  avalon_memory_mapped: 'Avalon-MM',
  clock: 'Clock',
  reset: 'Reset',
  interrupt: 'Interrupt',
  conduit: 'Conduit',
  other: 'Unknown',
};
const filterKinds = connectionKinds;
const hubLabels: Record<HubKind, string> = {
  avalon_memory_mapped: 'Avalon-MM masters',
  clock: 'Clock sources',
  reset: 'Reset sources',
  interrupt: 'IRQ receivers',
};
const adapterLabels: Record<QsysAdaptation['kind'], string> = {
  timing: 'Timing adapter',
  data_format: 'Data format adapter',
  channel: 'Channel adapter',
  error: 'Error adapter',
};

interface ViewState {
  viewMode: GraphViewMode;
  selectedKinds: Record<GraphViewMode, ConnectionKind[]>;
  showDisconnected: boolean;
  showDisabled: boolean;
  inferClockResetNames: boolean;
}

interface SavedViewState {
  viewMode?: GraphViewMode;
  selectedKinds?: ConnectionKind[] | Partial<Record<GraphViewMode, ConnectionKind[]>>;
  showDisconnected?: boolean;
  showDisabled?: boolean;
  inferClockResetNames?: boolean;
}

interface CanvasTransform { x: number; y: number; scale: number }

interface NavigationFrame {
  sourceGraph: QsysGraph;
  resource?: string;
  expandedSubsystems: Map<string, QsysGraph>;
  expandedSubsystemResources: Map<string, string>;
  stableLayoutCaches: Partial<Record<GraphViewMode, StableLayoutCache>>;
  transform: CanvasTransform;
  didInitialFit: boolean;
  activeHubId?: string;
  disabledConnectionIds: Set<string>;
}

const saved = (vscode.getState() ?? {}) as SavedViewState;
const state: ViewState = {
  viewMode: 'complete',
  selectedKinds: {
    pipeline: ['avalon_streaming', 'conduit'],
    complete: [...connectionKinds],
  },
  showDisconnected: false,
  showDisabled: false,
  inferClockResetNames: true,
};
applySavedViewState(saved);

let sourceGraph: QsysGraph | undefined;
let graph: QsysGraph | undefined;
let activeResource: string | undefined;
let layout: LayoutResult | undefined;
let stableLayoutCaches: Partial<Record<GraphViewMode, StableLayoutCache>> = {};
let expandedSubsystems = new Map<string, QsysGraph>();
let expandedSubsystemResources = new Map<string, string>();
const loadingSubsystems = new Set<string>();
const pendingSubsystemActions = new Map<string, 'expand' | 'enter'>();
const navigationStack: NavigationFrame[] = [];
let activeHubId: string | undefined;
let visibleHubs: InterfaceHub[] = [];
let visibleSystemExports: VisibleSystemExport[] = [];
const expandedComponentInterfaces = new Set<string>();
let layoutExternalPorts: LayoutExternalPort[] = [];
let layoutAnchorConnections: QsysConnection[] = [];
let disabledConnectionIds = new Set<string>();
let visibleConnectionFabrics = new Map<string, ConnectionFabric>();
interface VisibleFabricSegment {
  fabric: ConnectionFabric;
  endpoint: ConnectionFabricEndpoint;
  side: 'input' | 'output';
}

let visibleFabricSegments = new Map<string, VisibleFabricSegment>();
let renderVersion = 0;
let transform: CanvasTransform = { x: 20, y: 20, scale: 1 };
let didInitialFit = false;
let componentPanelOpen = false;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Qsys View root element is missing.');
app.innerHTML = `
  <header class="toolbar">
    <div class="toolbar-row toolbar-primary">
      <div class="brand"><strong id="system-name">Qsys View</strong><span id="summary"></span></div>
      <label class="view-mode">View
        <select id="view-mode" aria-label="Graph view mode">
          <option value="pipeline">Pipeline</option>
          <option value="complete">Classic</option>
        </select>
      </label>
      <div id="kind-filters" class="filters"></div>
    </div>
    <div class="toolbar-row toolbar-secondary">
      <div id="subsystem-navigation" class="subsystem-navigation hidden">
        <button id="subsystem-back" title="Return to the parent system">← Back</button>
        <span id="subsystem-path"></span>
      </div>
      <label id="infer-clock-reset-option" class="option" title="Classify unknown Tcl interfaces from common clock and reset names"><input id="infer-clock-reset" type="checkbox"> Infer clk/reset</label>
      <label class="option"><input id="show-disconnected" type="checkbox"> All IP</label>
      <label class="option"><input id="show-disabled" type="checkbox"> Disabled IP</label>
      <div id="expanded-subsystems" class="expanded-subsystems hidden"></div>
      <input id="search" class="search" type="search" placeholder="Find IP…" aria-label="Find IP">
      <button id="component-toggle" class="hidden" title="Show component parameters and external interfaces">IP definition</button>
      <button id="diagnostics-toggle" class="diagnostics-toggle hidden" title="Show Tcl parse problems"></button>
      <button id="quartus-metadata" title="Read exact interface metadata with qsys-script">Read interfaces…</button>
      <button id="open-platform-designer" title="Open this design in Intel Platform Designer">Open in Platform Designer</button>
      <button id="reload-source" title="Reload Qsys/Tcl sources and sourced configuration">Reload source</button>
      <button id="restore-connections" class="hidden" title="Restore connections hidden only in this Qsys View">Restore connections</button>
      <button id="relayout" title="Recalculate the layout from currently visible connections without discarding Quartus analysis">Relayout</button>
      <button id="fit" title="Fit graph to view">Fit</button>
    </div>
  </header>
  <main id="viewport" class="viewport">
    <svg id="canvas" aria-label="Qsys system graph">
      <defs id="definitions"></defs>
      <g id="scene"></g>
    </svg>
    <div id="interface-hubs" class="interface-hubs hidden"></div>
    <div id="status" class="status">Loading Qsys graph…</div>
    <aside id="diagnostics" class="diagnostics hidden" aria-label="Tcl parse problems">
      <header><strong>Tcl problems</strong><button id="diagnostics-close" title="Close">×</button></header>
      <div id="diagnostics-list" class="diagnostics-list"></div>
    </aside>
    <aside id="details" class="details hidden"></aside>
    <div class="legend">Drag to pan · Wheel to zoom · Click an IP for details</div>
  </main>`;

const canvas = required<SVGSVGElement>('canvas');
const scene = required<SVGGElement>('scene');
const viewport = required<HTMLElement>('viewport');
const status = required<HTMLElement>('status');
const details = required<HTMLElement>('details');
const search = required<HTMLInputElement>('search');
const filters = required<HTMLElement>('kind-filters');
const viewMode = required<HTMLSelectElement>('view-mode');
const pipelineViewOption = viewMode.querySelector<HTMLOptionElement>('option[value="pipeline"]')!;
if (!pipelineViewOption) throw new Error('Missing Pipeline view option.');
const quartusMetadata = required<HTMLButtonElement>('quartus-metadata');
const interfaceHubs = required<HTMLElement>('interface-hubs');
const inferClockResetNames = required<HTMLInputElement>('infer-clock-reset');
const inferClockResetOption = required<HTMLElement>('infer-clock-reset-option');
const expandedSubsystemControls = required<HTMLElement>('expanded-subsystems');
const subsystemNavigation = required<HTMLElement>('subsystem-navigation');
const subsystemPath = required<HTMLElement>('subsystem-path');
const diagnosticsToggle = required<HTMLButtonElement>('diagnostics-toggle');
const diagnosticsPanel = required<HTMLElement>('diagnostics');
const diagnosticsList = required<HTMLElement>('diagnostics-list');
const componentToggle = required<HTMLButtonElement>('component-toggle');
const restoreConnections = required<HTMLButtonElement>('restore-connections');

const filterCheckboxes = new Map<ConnectionKind, { checkbox: HTMLInputElement; label: HTMLLabelElement }>();
for (const kind of filterKinds) {
  const label = document.createElement('label');
  label.className = `kind-filter kind-${kind} hidden`;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selectedKinds().includes(kind);
  checkbox.addEventListener('change', () => {
    const current = selectedKinds();
    state.selectedKinds[state.viewMode] = checkbox.checked
      ? [...current, kind]
      : current.filter((selected) => selected !== kind);
    saveState();
    void render();
  });
  filterCheckboxes.set(kind, { checkbox, label });
  label.append(checkbox, document.createTextNode(labels[kind]));
  filters.append(label);
}

viewMode.value = state.viewMode;
viewMode.addEventListener('change', () => {
  state.viewMode = viewMode.value as GraphViewMode;
  updateKindFilters();
  activeHubId = undefined;
  didInitialFit = false;
  saveState();
  void render();
});

inferClockResetNames.checked = state.inferClockResetNames;
inferClockResetNames.addEventListener('change', () => {
  state.inferClockResetNames = inferClockResetNames.checked;
  activeHubId = undefined;
  updateKindFilters();
  saveState();
  void render();
});
const showDisconnected = required<HTMLInputElement>('show-disconnected');
showDisconnected.checked = state.showDisconnected;
showDisconnected.addEventListener('change', () => {
  state.showDisconnected = showDisconnected.checked;
  saveState();
  void render();
});
const showDisabled = required<HTMLInputElement>('show-disabled');
showDisabled.checked = state.showDisabled;
showDisabled.addEventListener('change', () => {
  state.showDisabled = showDisabled.checked;
  saveState();
  void render();
});
required<HTMLButtonElement>('fit').addEventListener('click', fitView);
restoreConnections.addEventListener('click', () => {
  disabledConnectionIds.clear();
  activeHubId = undefined;
  details.classList.add('hidden');
  updateConnectionVisibilityControl();
  void render();
});
required<HTMLButtonElement>('subsystem-back').addEventListener('click', leaveSubsystem);
diagnosticsToggle.addEventListener('click', () => diagnosticsPanel.classList.toggle('hidden'));
required<HTMLButtonElement>('diagnostics-close').addEventListener('click', () => diagnosticsPanel.classList.add('hidden'));
componentToggle.addEventListener('click', () => {
  componentPanelOpen = true;
  showComponentDetails();
});
const reloadSource = required<HTMLButtonElement>('reload-source');
reloadSource.addEventListener('click', () => {
  reloadSource.disabled = true;
  reloadSource.textContent = 'Reloading…';
  delete stableLayoutCaches.pipeline;
  delete stableLayoutCaches.complete;
  activeHubId = undefined;
  didInitialFit = false;
  showStatus('Reloading Qsys and Tcl sources…');
  vscode.postMessage({ type: 'reload', resource: activeResource });
});
required<HTMLButtonElement>('relayout').addEventListener('click', () => {
  delete stableLayoutCaches[state.viewMode];
  activeHubId = undefined;
  didInitialFit = false;
  void render();
});
quartusMetadata.addEventListener('click', () => {
  quartusMetadata.disabled = true;
  quartusMetadata.textContent = 'Running qsys-script…';
  showStatus('Quartus is elaborating a temporary copy of this Qsys system…');
  vscode.postMessage({ type: 'loadQuartusMetadata', resource: activeResource });
});
const openPlatformDesigner = required<HTMLButtonElement>('open-platform-designer');
openPlatformDesigner.addEventListener('click', () => {
  openPlatformDesigner.disabled = true;
  openPlatformDesigner.textContent = 'Opening Platform Designer…';
  vscode.postMessage({ type: 'openPlatformDesigner', resource: activeResource });
});
search.addEventListener('input', updateSearch);

let receivedInitialState = false;
window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as {
    type?: string;
    graph?: QsysGraph;
    message?: string;
    diagnostic?: QsysDiagnostic;
    instanceId?: string;
    resource?: string;
    rememberedViewState?: SavedViewState;
  };
  if (message.type === 'graph' && message.graph) {
    if (activeResource && message.resource && message.resource !== activeResource) {
      updateInactiveResourceGraph(message.resource, message.graph);
      return;
    }
    const firstGraph = !sourceGraph;
    if (!receivedInitialState && message.rememberedViewState) {
      applySavedViewState(message.rememberedViewState);
      syncViewControls();
    }
    receivedInitialState = true;
    if (message.resource) updateNavigationResourceGraph(message.resource, message.graph);
    activeResource = message.resource ?? activeResource;
    const previousComponentId = sourceGraph?.component?.moduleId;
    const componentWasExpanded = Boolean(previousComponentId && expandedSubsystems.has(previousComponentId));
    if (previousComponentId) {
      for (const id of [...expandedSubsystems.keys()]) {
        if (id === previousComponentId || id.startsWith(`${previousComponentId}/`)) {
          expandedSubsystems.delete(id);
          expandedSubsystemResources.delete(id);
        }
      }
    }
    sourceGraph = message.graph;
    if (componentWasExpanded && sourceGraph.component?.composition) {
      expandedSubsystems.set(sourceGraph.component.moduleId, sourceGraph.component.composition);
    }
    graph = composeHierarchy(sourceGraph, expandedSubsystems);
    if (firstGraph) didInitialFit = false;
    if (firstGraph && sourceGraph.component) componentPanelOpen = true;
    required<HTMLElement>('system-name').textContent = sourceGraph.name;
    updateAnalysisControls();
    updateCurrentDiagnostics();
    updateExpandedSubsystemControls();
    updateSubsystemNavigation();
    updateKindFilters();
    void render();
    if (sourceGraph.metadata.source === 'quartus') analyzeExpandedSubsystems();
  } else if (message.type === 'subsystemGraph' && message.graph && message.instanceId) {
    loadingSubsystems.delete(message.instanceId);
    const action = pendingSubsystemActions.get(message.instanceId) ?? 'expand';
    pendingSubsystemActions.delete(message.instanceId);
    const resource = message.resource ?? expandedSubsystemResources.get(message.instanceId);
    if (action === 'enter' && resource) {
      enterSubsystem(message.graph, resource);
    } else {
      expandedSubsystems.set(message.instanceId, message.graph);
      refreshComposedHierarchy();
    }
  } else if (message.type === 'subsystemError' && message.instanceId) {
    loadingSubsystems.delete(message.instanceId);
    pendingSubsystemActions.delete(message.instanceId);
    showStatus(message.message ?? `Unable to load subsystem ${message.instanceId}.`, true);
    if (layout) draw(layout);
  } else if (message.type === 'error') {
    updateDiagnostics(message.diagnostic ? [message.diagnostic] : []);
    showStatus(message.message ?? 'Unable to load Qsys file.', true);
  } else if (message.type === 'metadataError') {
    quartusMetadata.disabled = false;
    quartusMetadata.textContent = 'Retry Quartus metadata';
    showStatus(message.message ?? 'Unable to read interface metadata with Quartus.', true);
  } else if (message.type === 'metadataCancelled') {
    updateAnalysisControls();
    hideStatus();
  } else if (message.type === 'platformDesignerFinished') {
    openPlatformDesigner.disabled = false;
    openPlatformDesigner.textContent = 'Open in Platform Designer';
  } else if (message.type === 'reloadFinished') {
    reloadSource.disabled = false;
    reloadSource.textContent = 'Reload source';
  }
});

let pointer: { id: number; startX: number; startY: number; originX: number; originY: number } | undefined;
canvas.addEventListener('pointerdown', (event) => {
  if ((event.target as Element).closest('.node, .edge, .hierarchy-collapse-control, .hierarchy-enter-control')) return;
  pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, originX: transform.x, originY: transform.y };
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('panning');
});
canvas.addEventListener('pointermove', (event) => {
  if (!pointer || pointer.id !== event.pointerId) return;
  transform.x = pointer.originX + event.clientX - pointer.startX;
  transform.y = pointer.originY + event.clientY - pointer.startY;
  applyTransform();
});
canvas.addEventListener('pointerup', (event) => {
  if (pointer?.id === event.pointerId) pointer = undefined;
  canvas.classList.remove('panning');
});
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const bounds = canvas.getBoundingClientRect();
  const cursorX = event.clientX - bounds.left;
  const cursorY = event.clientY - bounds.top;
  const nextScale = clamp(transform.scale * Math.exp(-event.deltaY * 0.0015), 0.08, 4);
  transform.x = cursorX - ((cursorX - transform.x) / transform.scale) * nextScale;
  transform.y = cursorY - ((cursorY - transform.y) / transform.scale) * nextScale;
  transform.scale = nextScale;
  applyTransform();
}, { passive: false });

async function render(): Promise<void> {
  if (!graph) return;
  const version = ++renderVersion;
  details.classList.add('hidden');
  const allowedModules = graph.modules.filter((module) => state.showDisabled || !module.disabled);
  const allowedIds = new Set(allowedModules.map((module) => module.id));
  const inferredConnections = inferSourceDomainConnectionKinds(
    inferClockResetConnections(graph.connections, state.inferClockResetNames),
  );
  const enabledConnections = visibleConnections(inferredConnections, disabledConnectionIds);
  const renderedGraph = { ...graph, connections: enabledConnections };
  const allowedConnections = enabledConnections.filter((connection) =>
    allowedIds.has(connection.source) && allowedIds.has(connection.target),
  );
  const enabledKinds = selectedKinds().filter((kind) => isDirectKind(kind, state.viewMode) || isHubKind(kind, state.viewMode));
  const selectedConnections = allowedConnections.filter((connection) => enabledKinds.includes(connection.kind));
  const connections = selectedConnections.filter((connection) => isDirectKind(connection.kind, state.viewMode));
  const componentDefinition = Boolean(sourceGraph?.component);
  const supportedExports = collectExportedInterfaces(renderedGraph).filter((item) =>
    allowedIds.has(item.moduleId)
    && (componentDefinition || isDirectKind(item.kind, state.viewMode) || isHubKind(item.kind, state.viewMode)),
  );
  // An IP definition's pins are part of the block itself. Connection-kind
  // filters are useful for systems, but must never make component pins vanish.
  const selectedExports = componentDefinition
    ? supportedExports
    : supportedExports.filter((item) => enabledKinds.includes(item.kind));
  const displayedExports = componentDefinitionExports(
    selectedExports,
    sourceGraph?.component,
    expandedComponentInterfaces,
  );
  const layoutExports = componentDefinition
    ? displayedExports
    : componentDefinitionExports(supportedExports, undefined, expandedComponentInterfaces);
  const externalPorts = layoutExports.map((item) => ({
    moduleId: item.moduleId,
    interfaceName: item.anchorPort,
    direction: item.side,
    label: item.displayName,
  } satisfies LayoutExternalPort));
  const selectedHubKinds = enabledKinds.filter((kind) => isHubKind(kind, state.viewMode));
  const hubs = createInterfaceHubs(renderedGraph, selectedHubKinds, allowedIds);
  const connectedIds = connectedModuleIds(connections, hubs);
  for (const item of supportedExports) connectedIds.add(item.moduleId);
  const componentCollapsed = Boolean(
    sourceGraph?.component
    && !expandedSubsystems.has(sourceGraph.component.moduleId),
  );
  const modules = state.showDisconnected || componentCollapsed
    ? allowedModules
    : allowedModules.filter((module) => connectedIds.has(module.id));
  try {
    const structuralConnections = allowedConnections.filter((connection) => isDirectKind(connection.kind, state.viewMode));
    const structuralFabricGraph = createConnectionFabricGraph(allowedModules, structuralConnections);
    const visibleFabricGraph = createConnectionFabricGraph(modules, connections);
    const mode = state.viewMode;
    if (!stableLayoutCaches[mode]) {
      showStatus(state.viewMode === 'pipeline' && structuralConnections.some((connection) => connection.kind === 'avalon_streaming')
        ? 'Calculating Avalon-ST anchored layout…'
        : `Calculating ${state.viewMode === 'complete' ? 'Classic' : 'Pipeline'} layout…`);
    }
    const baseLayout = mode === 'pipeline' ? layoutAnchoredGraph : layoutGraph;
    const stable = await layoutStableGraph(
      structuralFabricGraph.modules,
      structuralFabricGraph.connections,
      stableLayoutCaches[mode],
      async (layoutModules, layoutConnections) => separateHierarchyGroups(
        await baseLayout(layoutModules, layoutConnections, externalPorts),
        [...expandedSubsystems.keys()],
        externalPorts,
        new Set(visibleFabricGraph.modules.map((module) => module.id)),
      ),
      externalPorts,
    );
    if (version !== renderVersion) return;
    stableLayoutCaches[mode] = stable.cache;
    const result = projectVisibleLayout(
      stable.layout,
      visibleFabricGraph.modules,
      visibleFabricGraph.connections,
      externalPorts,
    );
    layout = result;
    visibleSystemExports = displayedExports;
    layoutExternalPorts = externalPorts;
    layoutAnchorConnections = structuralFabricGraph.connections;
    setVisibleConnectionFabrics(visibleFabricGraph.fabrics);
    draw(result);
    visibleHubs = hubs;
    if (activeHubId && !hubs.some((hub) => hub.id === activeHubId)) activeHubId = undefined;
    drawInterfaceHubs(hubs);
    const visibleModuleIds = new Set(modules.map((module) => module.id));
    const visibleConnectionCount = selectedConnections.length
      + selectedExports.filter((item) => visibleModuleIds.has(item.moduleId)).length;
    const availableInterfaceCount = allowedConnections.length + supportedExports.length;
    required<HTMLElement>('summary').textContent = [
      `${modules.length}/${graph.modules.length} IP`,
      `${visibleConnectionCount}/${availableInterfaceCount} interfaces`,
      disabledConnectionIds.size > 0 ? `${disabledConnectionIds.size} disabled in view` : '',
    ].filter(Boolean).join(' · ');
    updateConnectionVisibilityControl();
    if (modules.length === 0) {
      showStatus('No graph elements match these filters. Enable another connection type or “All IP”.');
    } else {
      hideStatus();
      if (!didInitialFit) {
        requestAnimationFrame(fitView);
        didInitialFit = true;
      }
    }
    updateSearch();
    if (componentPanelOpen && sourceGraph?.component) showComponentDetails();
  } catch (error) {
    showStatus(`Layout failed: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}

function draw(result: LayoutResult): void {
  scene.replaceChildren();
  const hierarchyContainers = [...expandedSubsystems.keys()].flatMap((instanceId) => {
    const bounds = hierarchyBounds(result.nodes, instanceId);
    return bounds ? [{ instanceId, bounds }] : [];
  });
  for (const container of hierarchyContainers) drawHierarchyBackground(container.instanceId, container.bounds);
  for (const edge of result.edges) {
    const fabricSegment = visibleFabricSegments.get(edge.id);
    const displayedPaths = edge.paths;
    const group = svg('g', {
      class: `edge edge-${edge.kind}${fabricSegment ? ' fabric-segment' : ''}`,
      tabindex: '0',
      role: 'button',
    });
    for (const points of displayedPaths) {
      group.append(svg('path', {
        d: pathData(points),
        class: 'edge-hit',
      }));
      const lineAttributes: Record<string, string | number> = {
        d: pathData(points),
        class: 'edge-line',
      };
      lineAttributes['marker-end'] = `url(#arrow-${edge.kind})`;
      group.append(svg('path', lineAttributes));
      if (points.length > 0) {
        if (fabricSegment?.side !== 'output') group.append(edgeLabel(
          edge.sourcePort,
          points[0]!,
          'source-port',
        ));
        if (fabricSegment?.side !== 'input') group.append(edgeLabel(
          edge.targetPort,
          points.at(-1)!,
          'target-port',
        ));
      }
    }
    if (edge.adaptations && edge.adaptations.length > 0) {
      const midpoint = pathMidpoint(displayedPaths);
      if (midpoint) {
        group.append(svg('circle', {
          cx: midpoint.x,
          cy: midpoint.y,
          r: 6,
          class: 'adapter-dot',
        }));
      }
    }
    const title = svg('title');
    const adapterSummary = edge.adaptations?.map(formatAdaptation).join('\n');
    title.textContent = fabricSegment
      ? fabricSegmentTitle(fabricSegment.side, fabricSegment.endpoint, fabricSegment.fabric)
      : [
        `${edge.source}.${edge.sourcePort} → ${edge.target}.${edge.targetPort}`,
        `${labels[edge.kind]} (${edge.rawKind})`,
        adapterSummary,
      ].filter(Boolean).join('\n');
    group.append(title);
    const openDetails = (event: Event) => {
      event.stopPropagation();
      if (fabricSegment) showFabricEndpointDetails(fabricSegment.side, fabricSegment.endpoint, fabricSegment.fabric);
      else showConnectionDetails(edge);
    };
    group.addEventListener('click', openDetails);
    group.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Enter') openDetails(event);
    });
    scene.append(group);
    const terminal = fabricSegment && (fabricSegment.side === 'input'
      ? displayedPaths.at(-1)?.at(-1)
      : displayedPaths[0]?.[0]);
    if (terminal) scene.append(svg('circle', {
      cx: terminal.x,
      cy: terminal.y,
      r: 4.5,
      class: `endpoint-junction-dot edge-${edge.kind}`,
    }));
  }
  drawSystemExports(result);
  for (const node of result.nodes) {
    const fabric = visibleConnectionFabrics.get(node.id);
    if (fabric && isConnectionFabricModule(node)) {
      drawConnectionFabricNode(node, fabric);
      continue;
    }
    const group = svg('g', {
      class: `node${node.disabled ? ' disabled' : ''}${node.hierarchyPath ? ' nested' : ''}${node.subsystem ? ' subsystem' : ''}`,
      transform: `translate(${node.x} ${node.y})`,
      'data-module-id': node.id,
      'data-search': `${node.name} ${node.type}`.toLowerCase(),
      tabindex: '0',
      role: 'button',
    });
    group.append(svg('rect', { width: node.width, height: node.height, rx: 7 }));
    if (node.hierarchyPath) {
      const hierarchy = svg('text', { x: 14, y: 15, class: 'node-hierarchy' });
      hierarchy.textContent = truncate(node.hierarchyPath.join(' › '), 32);
      group.append(hierarchy);
    }
    const name = svg('text', { x: 14, y: node.hierarchyPath ? 35 : 29, class: 'node-name' });
    name.textContent = truncate(node.name, 28);
    const kind = svg('text', { x: 14, y: node.hierarchyPath ? 56 : 51, class: 'node-kind' });
    kind.textContent = truncate(node.type, 34);
    group.append(name, kind);
    if (node.subsystem) group.append(subsystemExpandControl(node, node.width));
    else if (componentComposition(node)) group.append(componentExpandControl(node, node.width));
    const openDetails = (event: Event) => {
      event.stopPropagation();
      if (sourceGraph?.component?.moduleId === node.id) {
        componentPanelOpen = true;
        showComponentDetails();
      } else {
        showModuleDetails(node);
      }
    };
    group.addEventListener('click', openDetails);
    group.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Enter') openDetails(event);
    });
    if (node.subsystem) {
      group.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        vscode.postMessage({ type: 'openSubsystem', resource: node.subsystem!.resource });
      });
    }
    scene.append(group);
  }
  for (const container of hierarchyContainers) {
    if (expandedSubsystemResources.has(container.instanceId)) {
      drawHierarchyEnterControl(container.instanceId, container.bounds);
    }
    drawHierarchyCollapseControl(container.instanceId, container.bounds);
  }
  createMarkers();
  applyTransform();
}

function setVisibleConnectionFabrics(fabrics: readonly ConnectionFabric[]): void {
  visibleConnectionFabrics = new Map(fabrics.map((fabric) => [fabric.id, fabric]));
  visibleFabricSegments = new Map<string, VisibleFabricSegment>();
  for (const fabric of fabrics) {
    for (const endpoint of fabric.inputs) {
      visibleFabricSegments.set(endpoint.edgeId, { fabric, endpoint, side: 'input' });
    }
    for (const endpoint of fabric.outputs) {
      visibleFabricSegments.set(endpoint.edgeId, { fabric, endpoint, side: 'output' });
    }
  }
}

function drawConnectionFabricNode(node: LayoutNode, fabric: ConnectionFabric): void {
  const group = svg('g', {
    class: `node connection-fabric kind-${fabric.kind}`,
    transform: `translate(${node.x} ${node.y})`,
    'data-module-id': node.id,
    'data-search': `${labels[fabric.kind]} interconnect`.toLowerCase(),
    tabindex: '0',
    role: 'button',
  });
  group.append(svg('rect', { width: node.width, height: node.height, rx: 12 }));
  const name = svg('text', { x: node.width / 2, y: node.height / 2 - 5, class: 'fabric-name' });
  name.textContent = `${labels[fabric.kind]} interconnect`;
  const summary = svg('text', { x: node.width / 2, y: node.height / 2 + 13, class: 'fabric-summary' });
  summary.textContent = `${fabric.inputs.length} in · ${fabric.outputs.length} out`;
  const title = svg('title');
  title.textContent = `${labels[fabric.kind]} interconnect\n${fabric.inputs.length} sources · ${fabric.outputs.length} targets · ${fabric.connections.length} connections`;
  group.append(name, summary, title);
  const openDetails = (event: Event) => {
    event.stopPropagation();
    showConnectionGroupDetails(
      `${labels[fabric.kind]} interconnect`,
      fabric,
      fabric.connections,
    );
  };
  group.addEventListener('click', openDetails);
  group.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    if (key === 'Enter' || key === ' ') openDetails(event);
  });
  scene.append(group);
}

function fabricSegmentTitle(
  side: 'input' | 'output',
  endpoint: ConnectionFabricEndpoint,
  fabric: ConnectionFabric,
): string {
  const endpointName = `${endpoint.moduleId}.${endpoint.interfaceName}`;
  const related = side === 'input'
    ? endpoint.connections.map(({ target, targetPort }) => `${target}.${targetPort}`)
    : endpoint.connections.map(({ source, sourcePort }) => `${source}.${sourcePort}`);
  return [
    side === 'input'
      ? `${endpointName} → ${labels[fabric.kind]} interconnect`
      : `${labels[fabric.kind]} interconnect → ${endpointName}`,
    `${related.length} ${side === 'input' ? 'target' : 'source'}${related.length === 1 ? '' : 's'}: ${related.join(', ')}`,
  ].join('\n');
}

function showFabricEndpointDetails(
  side: 'input' | 'output',
  endpoint: ConnectionFabricEndpoint,
  fabric: ConnectionFabric,
): void {
  if (endpoint.connections.length === 1) {
    showConnectionDetails(endpoint.connections[0]!);
    return;
  }
  const endpointName = `${endpoint.moduleId}.${endpoint.interfaceName}`;
  showConnectionGroupDetails(
    side === 'input'
      ? `${endpointName} → interconnect`
      : `Interconnect → ${endpointName}`,
    fabric,
    endpoint.connections,
  );
}

function showConnectionGroupDetails(
  headingText: string,
  fabric: ConnectionFabric,
  connections: readonly QsysConnection[],
): void {
  componentPanelOpen = false;
  details.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = headingText;
  const type = document.createElement('div');
  type.className = 'details-type';
  type.textContent = `${labels[fabric.kind]} · ${connections.length} connection${connections.length === 1 ? '' : 's'}`;
  const note = document.createElement('p');
  note.className = 'details-note';
  note.textContent = 'Each source enters the interconnect independently. Select a logical connection to inspect its parameters.';
  const title = document.createElement('h3');
  title.textContent = 'Logical connections';
  const list = document.createElement('div');
  list.className = 'fabric-connection-list';
  for (const connection of connections) {
    const button = document.createElement('button');
    button.className = 'fabric-connection';
    const address = connectionAddress(connection);
    button.textContent = `${connection.source}.${connection.sourcePort} → ${connection.target}.${connection.targetPort}${address ? ` · ${address}` : ''}`;
    button.addEventListener('click', () => showConnectionDetails(connection));
    list.append(button);
  }
  details.append(detailsCloseButton(), heading, type, note);
  const actions = connectionVisibilityActions(connections, 'Disable interconnect connections');
  if (actions) details.append(actions);
  details.append(title, list);
  details.classList.remove('hidden');
}

function connectionVisibilityActions(
  connections: readonly QsysConnection[],
  disableLabel = 'Disable connections',
): HTMLElement | undefined {
  const active = activeConnections(connections, disabledConnectionIds);
  const disabled = disabledConnections(connections, disabledConnectionIds);
  if (active.length === 0 && disabled.length === 0) return undefined;
  const actions = document.createElement('div');
  actions.className = 'details-actions connection-visibility-actions';
  if (active.length > 0) {
    const disable = document.createElement('button');
    disable.textContent = `${disableLabel} (${active.length})`;
    disable.title = 'Hide these connections only on this Qsys View canvas; the source file is not changed.';
    disable.addEventListener('click', () => disableConnectionsInView(active));
    actions.append(disable);
  }
  if (disabled.length > 0) {
    const enable = document.createElement('button');
    enable.textContent = `Enable hidden connections (${disabled.length})`;
    enable.title = 'Show these view-only hidden connections again.';
    enable.addEventListener('click', () => enableConnectionsInView(disabled));
    actions.append(enable);
  }
  return actions;
}

function disableConnectionsInView(connections: readonly QsysConnection[]): void {
  for (const connection of connections) disabledConnectionIds.add(connection.id);
  connectionVisibilityChanged();
}

function enableConnectionsInView(connections: readonly QsysConnection[]): void {
  for (const connection of connections) disabledConnectionIds.delete(connection.id);
  connectionVisibilityChanged();
}

function connectionVisibilityChanged(): void {
  activeHubId = undefined;
  details.classList.add('hidden');
  updateConnectionVisibilityControl();
  void render();
}

function updateConnectionVisibilityControl(): void {
  const existingIds = new Set(graph?.connections.map(({ id }) => id) ?? []);
  for (const id of disabledConnectionIds) {
    if (!existingIds.has(id)) disabledConnectionIds.delete(id);
  }
  const count = disabledConnectionIds.size;
  restoreConnections.classList.toggle('hidden', count === 0);
  restoreConnections.textContent = count === 0 ? 'Restore connections' : `Restore connections (${count})`;
}

function toggleComponentInterface(name: string): void {
  const iface = sourceGraph?.component?.externalInterfaces.find((candidate) => candidate.name === name);
  if (!iface?.ports.length) {
    componentPanelOpen = true;
    showComponentDetails(name);
    return;
  }
  if (expandedComponentInterfaces.has(name)) expandedComponentInterfaces.delete(name);
  else expandedComponentInterfaces.add(name);
  delete stableLayoutCaches.pipeline;
  delete stableLayoutCaches.complete;
  didInitialFit = false;
  void render();
}

function drawSystemExports(result: LayoutResult): void {
  const nodes = new Map(result.nodes.map((node) => [node.id, node]));
  const stubLengths = new Map<string, number>();
  for (const item of visibleSystemExports) {
    const key = `${item.moduleId}\u0000${item.side}`;
    stubLengths.set(key, Math.max(
      stubLengths.get(key) ?? 0,
      exportedInterfaceStubLength(systemExportLabel(item)),
    ));
  }
  for (const item of visibleSystemExports) {
    const node = nodes.get(item.moduleId);
    if (!node) continue;
    const anchorY = portAnchorY(
      node,
      item.side,
      item.anchorPort,
      layoutAnchorConnections,
      layoutExternalPorts,
    );
    const collapsedComponentInterface = Boolean(item.expandable && !item.signal);
    const labelText = systemExportLabel(item);
    // Align every terminal and label centre on the same side of one block.
    // The longest label determines the shared export-stub length.
    const stubLength = stubLengths.get(`${item.moduleId}\u0000${item.side}`)
      ?? exportedInterfaceStubLength(labelText);
    const input = item.side === 'input';
    const internal = { x: input ? node.x : node.x + node.width, y: anchorY };
    const external = { x: internal.x + (input ? -stubLength : stubLength), y: anchorY };
    const signalDirection = item.signal?.direction.toLowerCase();
    const flowsIntoBlock = signalDirection === 'input'
      ? true
      : signalDirection === 'output'
        ? false
        : input;
    const points = flowsIntoBlock ? [external, internal] : [internal, external];
    const componentInterface = Boolean(sourceGraph?.component);
    const group = svg('g', {
      class: `edge edge-${item.kind} exported-interface${componentInterface ? ' component-exported-interface' : ''}${collapsedComponentInterface ? ' collapsed-component-interface' : ''}`,
      ...(componentInterface ? {
        tabindex: '0',
        role: 'button',
        ...(item.expandable ? { 'aria-expanded': item.signal ? 'true' : 'false' } : {}),
        'aria-label': item.expandable
          ? `${item.signal ? 'Collapse' : 'Expand'} interface ${item.componentInterface}`
          : `Open interface ${item.name} details`,
      } : {}),
    });
    group.append(svg('path', {
      d: pathData(points),
      class: 'edge-line exported-interface-line',
      'marker-end': `url(#arrow-${item.kind})`,
    }));
    group.append(svg('circle', {
      cx: external.x,
      cy: external.y,
      r: 3.5,
      class: 'exported-interface-terminal',
    }));
    const label = svg('text', {
      x: (internal.x + external.x) / 2,
      y: anchorY - 7,
      class: 'exported-interface-label',
    });
    label.textContent = labelText;
    const title = svg('title');
    title.textContent = item.signal
      ? `${item.displayName}: ${item.signal.name}\n${item.signal.direction}, ${item.signal.width} bit${item.signal.width === 1 ? '' : 's'}\nClick to collapse ${item.componentInterface}`
      : `${item.name} ↔ ${item.endpoint}\n${labels[item.kind]} (${item.rawKind})${item.expandable ? '\nClick to expand physical signals' : ''}`;
    group.append(label, title);
    if (componentInterface) {
      const open = (event: Event) => {
        event.stopPropagation();
        toggleComponentInterface(item.componentInterface ?? item.name);
      };
      group.addEventListener('click', open);
      group.addEventListener('keydown', (event) => {
        const key = (event as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ') open(event);
      });
    }
    scene.append(group);
  }
}

function systemExportLabel(item: VisibleSystemExport): string {
  if (!item.componentInterface) return item.displayName;
  if (item.signal) return `${item.firstSignal ? '▾ ' : ''}${item.displayName}`;
  return `${item.expandable ? '▸ ' : ''}${item.displayName}`;
}

function drawHierarchyBackground(instanceId: string, bounds: HierarchyBounds): void {
  const group = svg('g', { class: 'hierarchy-container' });
  group.append(svg('rect', {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    rx: 14,
  }));
  const label = svg('text', {
    x: bounds.x + 12,
    y: bounds.y + 19,
    class: 'hierarchy-container-label',
  });
  label.textContent = instanceId;
  group.append(label);
  scene.append(group);
}

function drawHierarchyCollapseControl(instanceId: string, bounds: HierarchyBounds): void {
  const control = svg('g', {
    class: 'hierarchy-collapse-control',
    transform: `translate(${bounds.x + bounds.width - 32} ${bounds.y})`,
    tabindex: '0',
    role: 'button',
    'aria-label': `Collapse subsystem ${instanceId}`,
  });
  const symbol = svg('text', { x: 16, y: 20 });
  symbol.textContent = '−';
  control.append(svg('circle', { cx: 16, cy: 16, r: 10 }), symbol);
  const title = svg('title');
  title.textContent = `Collapse ${instanceId}`;
  control.append(title);
  const collapse = (event: Event) => {
    event.stopPropagation();
    collapseSubsystem(instanceId);
  };
  control.addEventListener('click', collapse);
  control.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    if (key === 'Enter' || key === ' ') collapse(event);
  });
  scene.append(control);
}

function drawHierarchyEnterControl(instanceId: string, bounds: HierarchyBounds): void {
  const control = svg('g', {
    class: 'hierarchy-enter-control',
    transform: `translate(${bounds.x + bounds.width - 60} ${bounds.y})`,
    tabindex: '0',
    role: 'button',
    'aria-label': `Enter subsystem ${instanceId}`,
  });
  const symbol = svg('text', { x: 16, y: 20 });
  symbol.textContent = '↘';
  control.append(svg('circle', { cx: 16, cy: 16, r: 10 }), symbol);
  const title = svg('title');
  title.textContent = `Enter ${instanceId}`;
  control.append(title);
  const enter = (event: Event) => {
    event.stopPropagation();
    const child = expandedSubsystems.get(instanceId);
    const resource = expandedSubsystemResources.get(instanceId);
    if (child && resource) enterSubsystem(child, resource);
  };
  control.addEventListener('click', enter);
  control.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    if (key === 'Enter' || key === ' ') enter(event);
  });
  scene.append(control);
}

function drawInterfaceHubs(hubs: InterfaceHub[]): void {
  interfaceHubs.replaceChildren();
  interfaceHubs.classList.toggle('hidden', hubs.length === 0);
  for (const kind of hubKindsIn(hubs)) {
    const section = document.createElement('section');
    section.className = `hub-group hub-group-${kind}`;
    const heading = document.createElement('h3');
    heading.textContent = hubLabels[kind];
    section.append(heading);
    for (const hub of hubs.filter((candidate) => candidate.kind === kind)) {
      const card = document.createElement('button');
      card.className = `interface-hub hub-${hub.kind}`;
      card.dataset.hubId = hub.id;
      card.style.setProperty('--hub-color', hubColor(hub));
      card.title = `${hub.endpoint} · ${hub.relatedModuleIds.length} connected IP`;
      const endpoint = document.createElement('strong');
      endpoint.textContent = hub.endpoint;
      const description = document.createElement('span');
      description.textContent = `${labels[hub.kind]} · ${hub.relatedModuleIds.length} IP${hub.frequency ? ` · ${hub.frequency}` : ''}`;
      card.append(endpoint, description);
      card.addEventListener('mouseenter', () => applyHubHighlight(hub));
      card.addEventListener('focus', () => applyHubHighlight(hub));
      card.addEventListener('mouseleave', restoreActiveHub);
      card.addEventListener('blur', restoreActiveHub);
      card.addEventListener('click', () => {
        activeHubId = activeHubId === hub.id ? undefined : hub.id;
        updateHubSelection();
      });
      section.append(card);
    }
    interfaceHubs.append(section);
  }
  updateHubSelection();
}

function hubKindsIn(hubs: InterfaceHub[]): HubKind[] {
  return ['avalon_memory_mapped', 'clock', 'reset', 'interrupt']
    .filter((kind): kind is HubKind => hubs.some((hub) => hub.kind === kind));
}

function updateHubSelection(): void {
  interfaceHubs.querySelectorAll<HTMLElement>('.interface-hub').forEach((card) => {
    card.classList.toggle('selected', card.dataset.hubId === activeHubId);
  });
  const active = visibleHubs.find((hub) => hub.id === activeHubId);
  applyHubHighlight(active);
  drawAddressBadges(active?.kind === 'avalon_memory_mapped' ? active : undefined);
}

function restoreActiveHub(): void {
  applyHubHighlight(visibleHubs.find((hub) => hub.id === activeHubId));
}

function applyHubHighlight(hub: InterfaceHub | undefined): void {
  const related = new Set(hub?.relatedModuleIds ?? []);
  scene.querySelectorAll<SVGGElement>('.edge').forEach((edge) => {
    edge.classList.toggle('hub-dimmed', Boolean(hub));
  });
  scene.querySelectorAll<SVGGElement>('.node').forEach((node) => {
    const moduleId = node.dataset.moduleId ?? '';
    if (hub) node.style.setProperty('--active-hub-color', hubColor(hub));
    else node.style.removeProperty('--active-hub-color');
    node.classList.toggle('hub-related', Boolean(hub) && related.has(moduleId));
    node.classList.toggle('hub-origin', Boolean(hub) && moduleId === hub?.moduleId);
    node.classList.toggle('hub-dimmed', Boolean(hub) && !related.has(moduleId) && moduleId !== hub?.moduleId);
  });
}

function drawAddressBadges(hub: InterfaceHub | undefined): void {
  scene.querySelector('#address-badges')?.remove();
  if (!hub || !layout) return;
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const byModule = new Map<string, QsysConnection[]>();
  for (const connection of hub.connections) {
    const current = byModule.get(connection.target) ?? [];
    current.push(connection);
    byModule.set(connection.target, current);
  }
  const layer = svg('g', { id: 'address-badges', class: 'address-badges' });
  layer.style.setProperty('--hub-color', hubColor(hub));
  for (const [moduleId, connections] of byModule) {
    const node = nodes.get(moduleId);
    if (!node) continue;
    for (const [index, connection] of connections.entries()) {
      const badgeHeight = 22;
      const y = node.y + node.height + 5 + index * (badgeHeight + 4);
      const group = svg('g', { class: 'address-badge' });
      group.append(svg('rect', { x: node.x, y, width: node.width, height: badgeHeight, rx: 4 }));
      const value = svg('text', { x: node.x + node.width / 2, y: y + 15 });
      value.textContent = connectionAddress(connection) ?? 'address unavailable';
      const title = svg('title');
      title.textContent = `${connection.source}.${connection.sourcePort} → ${connection.target}.${connection.targetPort}`;
      group.append(value, title);
      layer.append(group);
    }
  }
  scene.append(layer);
}

function hubColor(hub: InterfaceHub): string {
  let hash = 0;
  for (const character of hub.id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 62% 55%)`;
}

function createMarkers(): void {
  const definitions = required<SVGDefsElement>('definitions');
  definitions.replaceChildren();
  for (const kind of connectionKinds) {
    const marker = svg('marker', {
      id: `arrow-${kind}`,
      viewBox: '0 0 8 8',
      refX: '7', refY: '4', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
      class: `arrow edge-${kind}`,
    });
    marker.append(svg('path', { d: 'M 0 0 L 8 4 L 0 8 z' }));
    definitions.append(marker);
  }
}

function showComponentDetails(expandedInterface?: string): void {
  const component = sourceGraph?.component;
  if (!component) return;
  details.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = sourceGraph?.name ?? component.kind ?? 'IP definition';
  const type = document.createElement('div');
  type.className = 'details-type';
  type.textContent = [
    component.kind,
    component.version ? `v${component.version}` : undefined,
    component.mode === 'composition' ? 'composition' : 'leaf component',
  ]
    .filter(Boolean).join(' · ');
  const note = document.createElement('p');
  note.className = 'details-note';
  note.textContent = component.exact
    ? component.mode === 'composition'
      ? 'Parameters and interfaces reflect the safely evaluated composition callback. Expand the block to inspect its internal IP and connections.'
      : 'Parameters, interfaces, and physical signals reflect the safely evaluated component callbacks; Quartus is not required.'
    : 'Static or partial callback preview. Tcl errors are shown in Diagnostics; successfully registered interfaces and files are still available.';
  details.append(detailsCloseButton(), heading, type, note);
  if (!component.exact) {
    const reason = sourceGraph?.diagnostics?.find((diagnostic) =>
      diagnostic.message.includes('stopped early')
      || diagnostic.message.includes('elaboration unavailable'));
    if (reason) {
      const warning = document.createElement('p');
      warning.className = 'metadata-unavailable';
      warning.textContent = reason.message;
      details.append(warning);
    }
  }

  if (component.composition) {
    const compositionActions = document.createElement('div');
    compositionActions.className = 'details-actions';
    const toggleComposition = document.createElement('button');
    const expanded = expandedSubsystems.has(component.moduleId);
    toggleComposition.textContent = expanded ? 'Collapse internal graph' : 'Expand internal graph';
    toggleComposition.addEventListener('click', () => {
      if (expanded) collapseSubsystem(component.moduleId);
      else expandComponentComposition();
    });
    compositionActions.append(toggleComposition);
    details.append(compositionActions);
  }

  // Keep sources near the top of the definition panel for both leaf IP and
  // compositions. Compositions can register shared package files too.
  appendComponentFiles(component.files);

  const title = document.createElement('h3');
  title.textContent = `Parameters (${component.parameters.length})`;
  details.append(title);
  const visibleParameters = component.parameters.filter((parameter) => parameter.visible);
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const groups = new Map<string, QsysComponentParameter[]>();
  for (const parameter of visibleParameters) {
    const group = parameter.group ?? '';
    groups.set(group, [...(groups.get(group) ?? []), parameter]);
  }
  for (const [group, parameters] of groups) {
    if (group) {
      const groupTitle = document.createElement('h4');
      groupTitle.textContent = group;
      details.append(groupTitle);
    }
    for (const parameter of parameters) {
      const field = componentParameterField(parameter);
      controls.set(parameter.name, field.control);
      details.append(field.element);
    }
  }
  if (visibleParameters.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'details-note';
    empty.textContent = 'This component does not expose visible parameters.';
    details.append(empty);
  }

  const actions = document.createElement('div');
  actions.className = 'details-actions component-actions';
  const apply = document.createElement('button');
  apply.textContent = 'Apply & re-elaborate';
  apply.disabled = !component.exact;
  apply.addEventListener('click', () => {
    const invalid = [...controls.values()].find((control) => !control.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    const values = Object.fromEntries(component.parameters.map((parameter) => [
      parameter.name,
      controls.get(parameter.name)?.value ?? parameter.value,
    ]));
    apply.disabled = true;
    apply.textContent = 'Elaborating…';
    delete stableLayoutCaches.pipeline;
    delete stableLayoutCaches.complete;
    didInitialFit = false;
    showStatus('Evaluating component callbacks with the selected parameters…');
    vscode.postMessage({
      type: 'setComponentParameters',
      resource: activeResource,
      parameters: values,
    });
  });
  const reset = document.createElement('button');
  reset.textContent = 'Defaults';
  reset.disabled = !component.exact;
  reset.addEventListener('click', () => {
    for (const parameter of component.parameters) {
      const control = controls.get(parameter.name);
      if (control) control.value = parameter.defaultValue;
    }
  });
  actions.append(apply, reset);
  details.append(actions);

  const interfacesTitle = document.createElement('h3');
  interfacesTitle.textContent = `External interfaces (${component.externalInterfaces.length})`;
  details.append(interfacesTitle);
  for (const iface of component.externalInterfaces) {
    details.append(componentInterfaceDetails(iface, iface.name === expandedInterface));
  }
  if (component.externalInterfaces.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'details-note';
    empty.textContent = 'No external interfaces were created for this parameter set.';
    details.append(empty);
  }
  details.classList.remove('hidden');
}

function appendComponentFiles(files: NonNullable<QsysGraph['component']>['files']): void {
  const title = document.createElement('h3');
  title.textContent = `Files (${files.length})`;
  details.append(title);
  if (files.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'details-note';
    empty.textContent = 'No fileset files were registered by the evaluated component.';
    details.append(empty);
    return;
  }

  const tree = componentFileTree(files);
  const root = document.createElement('div');
  root.className = 'component-file-tree';
  appendFileTreeContents(root, tree);
  details.append(root);
}

interface ComponentFileTreeNode {
  folders: Map<string, ComponentFileTreeNode>;
  files: QsysComponentFile[];
}

function componentFileTree(files: readonly QsysComponentFile[]): ComponentFileTreeNode {
  const root: ComponentFileTreeNode = { folders: new Map(), files: [] };
  for (const file of files) {
    const pathParts = file.path.replaceAll('\\', '/').split('/').filter(Boolean);
    pathParts.pop();
    // Component file paths frequently start with several ../ segments. They
    // are useful in the full path shown on the file row, but add no useful
    // hierarchy. Begin the visual tree at the first named folder instead.
    while (pathParts[0] === '.' || pathParts[0] === '..') pathParts.shift();
    let node = root;
    for (const folder of pathParts) {
      const child = node.folders.get(folder) ?? { folders: new Map(), files: [] };
      node.folders.set(folder, child);
      node = child;
    }
    node.files.push(file);
  }
  return root;
}

function appendFileTreeContents(parent: HTMLElement, node: ComponentFileTreeNode): void {
  const folders = [...node.folders].sort(([left], [right]) => naturalTextOrder(left, right));
  const files = [...node.files].sort((left, right) => naturalTextOrder(left.path, right.path));
  const entries: Array<
    | { type: 'folder'; name: string; node: ComponentFileTreeNode }
    | { type: 'file'; file: QsysComponentFile }
  > = [
    ...folders.map(([name, child]) => ({ type: 'folder' as const, name, node: child })),
    ...files.map((file) => ({ type: 'file' as const, file })),
  ];
  entries.forEach((entry, index) => {
    const last = index === entries.length - 1;
    if (entry.type === 'file') {
      parent.append(componentFileRow(entry.file, last));
      return;
    }
    const folder = document.createElement('details');
    folder.className = `component-file-folder${last ? ' is-last' : ''}`;
    const summary = document.createElement('summary');
    const branch = document.createElement('span');
    branch.className = 'component-file-branch';
    branch.textContent = last ? '└─' : '├─';
    const toggle = document.createElement('span');
    toggle.className = 'component-file-toggle';
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const syncToggle = () => { toggle.textContent = folder.open ? '−' : '+'; };
    folder.addEventListener('toggle', syncToggle);
    syncToggle();
    summary.append(branch, toggle, name);
    const contents = document.createElement('div');
    contents.className = 'component-file-folder-contents';
    appendFileTreeContents(contents, entry.node);
    folder.append(summary, contents);
    parent.append(folder);
  });
}

function componentFileRow(file: QsysComponentFile, last: boolean): HTMLElement {
  const row = document.createElement('article');
  row.className = 'component-file';
  row.title = [
    file.path,
    file.origin ? `Registered by ${file.origin}` : 'Registered directly by the component',
  ].join('\n');
  const branch = document.createElement('span');
  branch.className = 'component-file-branch';
  branch.textContent = last ? '└─' : '├─';
  const fileName = document.createElement('button');
  fileName.type = 'button';
  fileName.className = 'component-file-link';
  fileName.textContent = file.path.replaceAll('\\', '/').split('/').at(-1) || file.name;
  fileName.addEventListener('click', () => {
    vscode.postMessage({
      type: 'openComponentFile',
      resource: activeResource,
      path: file.path,
    });
  });
  const metadata = document.createElement('span');
  metadata.className = 'component-file-metadata';
  const values = [file.type, ...file.filesets, ...file.tags].filter(Boolean);
  metadata.textContent = values.length > 0 ? `(${values.join(', ')})` : '';
  row.append(branch, fileName, metadata);
  return row;
}

function naturalTextOrder(left: string, right: string): number {
  return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });
}

function componentParameterField(parameter: QsysComponentParameter): {
  element: HTMLElement;
  control: HTMLInputElement | HTMLSelectElement;
} {
  const field = document.createElement('label');
  field.className = `component-parameter${parameter.valid ? '' : ' invalid'}`;
  const label = document.createElement('span');
  label.className = 'component-parameter-label';
  label.textContent = parameter.displayName ?? parameter.name;
  const name = document.createElement('code');
  name.textContent = parameter.name;

  let control: HTMLInputElement | HTMLSelectElement;
  if (parameter.allowedValues && parameter.allowedValues.length > 0) {
    const select = document.createElement('select');
    for (const value of parameter.allowedValues) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    if (!parameter.allowedValues.includes(parameter.value)) {
      const option = document.createElement('option');
      option.value = parameter.value;
      option.textContent = parameter.value;
      select.append(option);
    }
    select.value = parameter.value;
    control = select;
  } else if (parameter.displayHint?.toLowerCase() === 'boolean' || parameter.type.toLowerCase() === 'boolean') {
    const select = document.createElement('select');
    const numeric = ['0', '1'].includes(parameter.value) || ['0', '1'].includes(parameter.defaultValue);
    const choices: Array<[string, string]> = numeric
      ? [['0', 'False'], ['1', 'True']]
      : [['false', 'False'], ['true', 'True']];
    for (const [value, text] of choices) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    select.value = parameter.value;
    control = select;
  } else {
    const input = document.createElement('input');
    input.value = parameter.value;
    if (/^(?:integer|int|long|double|float|number)$/i.test(parameter.type)) {
      input.type = 'number';
      input.step = /^(?:integer|int|long)$/i.test(parameter.type) ? '1' : 'any';
      const range = parameter.range?.split(':');
      if (range?.length === 2) {
        input.min = range[0] ?? '';
        input.max = range[1] ?? '';
      }
    } else {
      input.type = 'text';
    }
    control = input;
  }
  control.disabled = !parameter.enabled || parameter.derived;
  control.title = parameter.description ?? parameter.name;
  field.append(label, name, control);
  if (parameter.description) {
    const description = document.createElement('small');
    description.textContent = parameter.description;
    field.append(description);
  }
  return { element: field, control };
}

function componentInterfaceDetails(iface: QsysComponentInterface, expanded = false): HTMLElement {
  const section = document.createElement('details');
  section.className = `component-interface kind-${iface.kind}`;
  section.open = expanded;
  const summary = document.createElement('summary');
  const heading = document.createElement('strong');
  heading.textContent = iface.name;
  const kind = document.createElement('div');
  kind.className = 'interface-kind';
  kind.textContent = [
    iface.rawKind,
    iface.direction || 'unspecified direction',
    `${iface.ports.length} signal${iface.ports.length === 1 ? '' : 's'}`,
  ].join(' · ');
  summary.append(heading, kind);
  section.append(summary);
  const body = document.createElement('div');
  body.className = 'component-interface-body';
  if (iface.exportOf) {
    const exported = document.createElement('p');
    exported.className = 'details-note';
    exported.textContent = `Exports ${iface.exportOf}`;
    body.append(exported);
  }
  if (Object.keys(iface.parameters).length > 0) {
    const properties = document.createElement('dl');
    for (const [name, value] of Object.entries(iface.parameters)) appendDefinition(properties, name, value);
    body.append(properties);
  }
  if (iface.ports.length > 0) {
    const portTitle = document.createElement('h4');
    portTitle.textContent = 'Signals';
    const ports = document.createElement('dl');
    for (const port of iface.ports) {
      appendDefinition(ports, port.role || port.name, `${port.width} bit · ${port.direction} · ${port.name}`);
    }
    body.append(portTitle, ports);
  } else {
    const empty = document.createElement('p');
    empty.className = 'details-note';
    empty.textContent = iface.exportOf
      ? 'Physical signals belong to the exported internal interface.'
      : 'No physical signals were declared for this interface.';
    body.append(empty);
  }
  section.append(body);
  return section;
}

function showModuleDetails(module: QsysModule): void {
  componentPanelOpen = false;
  details.replaceChildren();
  const close = detailsCloseButton();
  const heading = document.createElement('h2');
  heading.textContent = module.name;
  const type = document.createElement('div');
  type.className = 'details-type';
  type.textContent = `${module.type}${module.disabled ? ' · disabled' : ''}`;
  details.append(close, heading, type);
  if (module.hierarchyPath) {
    const hierarchy = document.createElement('p');
    hierarchy.className = 'details-note';
    hierarchy.textContent = `Inside ${module.hierarchyPath.join(' › ')}`;
    details.append(hierarchy);
  }
  if (module.subsystem) {
    const actions = document.createElement('div');
    actions.className = 'details-actions';
    const enter = document.createElement('button');
    enter.textContent = 'Enter subsystem';
    enter.addEventListener('click', () => requestSubsystemEntry(module));
    const expand = document.createElement('button');
    expand.textContent = 'Expand on canvas';
    expand.addEventListener('click', () => requestSubsystemExpansion(module));
    const open = document.createElement('button');
    open.textContent = 'Open in new editor';
    open.addEventListener('click', () => {
      vscode.postMessage({ type: 'openSubsystem', resource: module.subsystem!.resource });
    });
    actions.append(enter, expand, open);
    details.append(actions);
  }
  if (graph) {
    const actions = connectionVisibilityActions(moduleConnections(graph.connections, module.id));
    if (actions) details.append(actions);
  }
  details.append(parameterTable('Parameters', module.parameters, module.parameterMetadata));
  details.classList.remove('hidden');
}

function showConnectionDetails(connection: QsysConnection): void {
  if (!graph) return;
  componentPanelOpen = false;
  const source = graph.modules.find((module) => module.id === connection.source);
  const target = graph.modules.find((module) => module.id === connection.target);
  details.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = `${connection.source}.${connection.sourcePort} → ${connection.target}.${connection.targetPort}`;
  const type = document.createElement('div');
  type.className = 'details-type';
  type.textContent = `${labels[connection.kind]} · ${connection.rawKind}`;
  details.append(detailsCloseButton(), heading, type);

  if (connection.adaptations && connection.adaptations.length > 0) {
    details.append(adaptationDetails(connection.adaptations));
  }

  if (connection.kind === 'avalon_streaming' && source && target) {
    const sourceInterface = graph.interfaces[`${connection.source}.${connection.sourcePort}`];
    const targetInterface = graph.interfaces[`${connection.target}.${connection.targetPort}`];
    const note = document.createElement('p');
    note.className = 'details-note';
    note.textContent = graph.metadata.label;
    details.append(note);
    if (sourceInterface) details.append(interfaceTable(`Source · ${source.name}.${connection.sourcePort}`, sourceInterface));
    if (targetInterface) details.append(interfaceTable(`Sink · ${target.name}.${connection.targetPort}`, targetInterface));
    if (sourceInterface && targetInterface && graph.metadata.source === 'quartus') {
      details.append(waveformExample(sourceInterface, targetInterface));
    } else {
      const unavailable = document.createElement('p');
      unavailable.className = 'metadata-unavailable';
      unavailable.textContent = 'Waveform unavailable until qsys-script elaborates both interfaces. Qsys View does not infer missing signals from module parameters.';
      const load = document.createElement('button');
      load.textContent = 'Read interfaces with Quartus…';
      load.addEventListener('click', () => quartusMetadata.click());
      details.append(unavailable, load);
    }
    details.append(
      parameterTable(`Configured source parameters · ${source.name}`, streamParameters(source)),
      parameterTable(`Configured sink parameters · ${target.name}`, streamParameters(target)),
    );
  }
  details.append(parameterTable('Connection parameters', connection.parameters));
  details.classList.remove('hidden');
}

function formatAdaptation(item: QsysAdaptation): string {
  const differences = item.differences.map((difference) =>
    `${difference.property}: ${difference.source} → ${difference.target}`,
  ).join(', ');
  return `${adapterLabels[item.kind]} — ${differences}`;
}

function adaptationDetails(adaptations: QsysAdaptation[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'adaptation-details';
  const title = document.createElement('h3');
  title.textContent = 'Automatic adaptation';
  const note = document.createElement('p');
  note.className = 'details-note';
  note.textContent = 'Quartus will insert adapter logic for the mismatched Avalon-ST endpoints.';
  section.append(title, note);
  for (const item of adaptations) {
    const heading = document.createElement('h4');
    heading.textContent = adapterLabels[item.kind];
    const table = document.createElement('dl');
    for (const difference of item.differences) {
      appendDefinition(table, difference.property, `${difference.source} → ${difference.target}`);
    }
    section.append(heading, table);
  }
  return section;
}

function detailsCloseButton(): HTMLButtonElement {
  const close = document.createElement('button');
  close.className = 'details-close';
  close.textContent = '×';
  close.title = 'Close';
  close.addEventListener('click', () => {
    componentPanelOpen = false;
    details.classList.add('hidden');
  });
  return close;
}

function parameterTable(
  titleText: string,
  parameters: Record<string, string>,
  metadata?: QsysModule['parameterMetadata'],
): HTMLElement {
  const section = document.createElement('section');
  const title = document.createElement('h3');
  title.textContent = titleText;
  section.append(title);
  const groups = groupParameters(parameters, metadata);
  for (const group of groups) {
    if (group.name) {
      const groupTitle = document.createElement('h4');
      groupTitle.textContent = group.name;
      section.append(groupTitle);
    }
    const table = document.createElement('dl');
    for (const [name, value] of group.entries) appendDefinition(table, name, value);
    section.append(table);
  }
  if (groups.length === 0) {
    const table = document.createElement('dl');
    const empty = document.createElement('div');
    empty.className = 'empty-parameters';
    empty.textContent = 'Not serialized in this Qsys file.';
    table.append(empty);
    section.append(table);
  }
  return section;
}

function interfaceTable(titleText: string, iface: QsysInterface): HTMLElement {
  const section = document.createElement('section');
  const title = document.createElement('h3');
  title.textContent = titleText;
  const type = document.createElement('div');
  type.className = 'interface-kind';
  type.textContent = `${iface.kind} · ${iface.source}`;
  const parameters = document.createElement('dl');
  for (const [name, value] of Object.entries(iface.parameters)) appendDefinition(parameters, name, value);
  const portTitle = document.createElement('h4');
  portTitle.textContent = 'Elaborated ports';
  const ports = document.createElement('dl');
  for (const port of iface.ports) {
    appendDefinition(ports, port.role, `${port.width} bit · ${port.direction} · ${port.name}`);
  }
  section.append(title, type, parameters, portTitle, ports);
  return section;
}

function appendDefinition(table: HTMLDListElement, name: string, value: string): void {
  const term = document.createElement('dt');
  term.textContent = name;
  const definition = document.createElement('dd');
  definition.textContent = value;
  table.append(term, definition);
}

function waveformExample(source: QsysInterface, target: QsysInterface): HTMLElement {
  const model = createInterfaceWaveform(source, target);
  const section = document.createElement('section');
  const title = document.createElement('h3');
  title.textContent = 'Example transfer waveform';
  const note = document.createElement('p');
  note.className = 'waveform-note';
  const description = [
    model.symbolsPerBeat === undefined ? undefined : `${model.symbolsPerBeat} symbol${model.symbolsPerBeat === 1 ? '' : 's'}/beat`,
    model.dataWidth === undefined ? undefined : `${model.dataWidth}-bit data`,
    model.signals.some((signal) => signal.name === 'ready') ? `ready latency ${model.readyLatency}` : 'no ready port',
  ].filter(Boolean).join(' · ');
  note.textContent = `Illustrative Avalon-ST transfer — not simulation output. ${description}.`;
  const longestSignalLabel = Math.max(1, ...model.signals.map((signal) => signal.label.length));
  const left = Math.max(70, Math.min(190, longestSignalLabel * 5.5 + 18));
  const longestValue = Math.max(1, ...model.signals.flatMap((signal) => signal.values.map((value) => value.length)));
  const cycle = Math.max(48, longestValue * 5.5 + 10);
  const rowHeight = 34;
  const top = 30;
  const width = left + model.cycles * cycle + 4;
  const height = top + model.signals.length * rowHeight + 10;
  const wave = svg('svg', { class: 'waveform', viewBox: `0 0 ${width} ${height}`, role: 'img' });
  for (let index = 0; index <= model.cycles; index++) {
    wave.append(svg('line', { x1: left + index * cycle, y1: 18, x2: left + index * cycle, y2: height - 8, class: 'wave-grid' }));
    if (index < model.cycles) {
      const label = svg('text', { x: left + index * cycle + cycle / 2, y: 12, class: 'wave-cycle' });
      label.textContent = String(index);
      wave.append(label);
    }
  }
  for (const transfer of model.transferCycles) {
    wave.append(svg('line', {
      x1: left + transfer * cycle + cycle / 2,
      y1: 18,
      x2: left + transfer * cycle + cycle / 2,
      y2: height - 8,
      class: 'wave-transfer-line',
    }));
  }
  for (const [row, signal] of model.signals.entries()) {
    const y = top + row * rowHeight + rowHeight / 2;
    const label = svg('text', { x: left - 10, y: y + 4, class: 'wave-label' });
    label.textContent = signal.label;
    wave.append(label);
    if (signal.kind === 'digital') {
      wave.append(svg('path', {
        d: digitalPath(signal.values.map(Number), left, y, cycle),
        class: `wave-signal wave-${signal.name}`,
      }));
      continue;
    }
    for (const [index, value] of signal.values.entries()) {
      const stalled = signal.name === 'data'
        && value !== '—'
        && !model.transferCycles.includes(index);
      const box = svg('rect', {
        x: left + index * cycle,
        y: y - 13,
        width: cycle,
        height: 26,
        class: `wave-data${stalled ? ' stalled' : ''}`,
      });
      const valueLabel = svg('text', { x: left + index * cycle + cycle / 2, y: y + 4, class: 'wave-data-label' });
      valueLabel.textContent = value;
      wave.append(box, valueLabel);
    }
  }
  const controls = document.createElement('div');
  controls.className = 'waveform-controls';
  const zoomOut = document.createElement('button');
  zoomOut.textContent = '−';
  zoomOut.title = 'Zoom waveform out';
  const zoomReset = document.createElement('button');
  zoomReset.textContent = '100%';
  zoomReset.title = 'Reset waveform zoom';
  const zoomIn = document.createElement('button');
  zoomIn.textContent = '+';
  zoomIn.title = 'Zoom waveform in';
  const zoomValue = document.createElement('span');
  let zoom = 1;
  const applyWaveformZoom = () => {
    wave.style.width = `${Math.round(width * zoom)}px`;
    zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= 0.5;
    zoomIn.disabled = zoom >= 4;
  };
  zoomOut.addEventListener('click', () => {
    zoom = clamp(zoom - 0.25, 0.5, 4);
    applyWaveformZoom();
  });
  zoomReset.addEventListener('click', () => {
    zoom = 1;
    applyWaveformZoom();
  });
  zoomIn.addEventListener('click', () => {
    zoom = clamp(zoom + 0.25, 0.5, 4);
    applyWaveformZoom();
  });
  controls.append(zoomOut, zoomReset, zoomIn, zoomValue);
  const waveViewport = document.createElement('div');
  waveViewport.className = 'waveform-viewport';
  waveViewport.addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoom = clamp(zoom + (event.deltaY < 0 ? 0.25 : -0.25), 0.5, 4);
    applyWaveformZoom();
  }, { passive: false });
  waveViewport.append(wave);
  applyWaveformZoom();
  section.append(title, note, controls, waveViewport);
  return section;
}

function digitalPath(values: number[], left: number, middle: number, cycle: number): string {
  const high = middle - 9;
  const low = middle + 9;
  let path = `M ${left} ${values[0] ? high : low}`;
  for (let index = 0; index < values.length; index++) {
    const x2 = left + (index + 1) * cycle;
    const y = values[index] ? high : low;
    path += ` L ${x2} ${y}`;
    const next = values[index + 1];
    if (next !== undefined && next !== values[index]) path += ` L ${x2} ${next ? high : low}`;
  }
  return path;
}

function fitView(): void {
  if (!layout || layout.nodes.length === 0) return;
  const bounds = viewport.getBoundingClientRect();
  const padding = 50;
  const scale = clamp(Math.min(
    (bounds.width - padding * 2) / layout.width,
    (bounds.height - padding * 2) / layout.height,
  ), 0.08, 1.5);
  transform = {
    scale,
    x: (bounds.width - layout.width * scale) / 2,
    y: (bounds.height - layout.height * scale) / 2,
  };
  applyTransform();
}

function updateSearch(): void {
  const query = search.value.trim().toLowerCase();
  scene.querySelectorAll<SVGGElement>('.node').forEach((node) => {
    const matches = query.length > 0 && (node.dataset.search ?? '').includes(query);
    node.classList.toggle('match', matches);
    node.classList.toggle('dimmed', query.length > 0 && !matches);
  });
}

function applyTransform(): void {
  scene.setAttribute('transform', `translate(${transform.x} ${transform.y}) scale(${transform.scale})`);
}

function edgeLabel(value: string, point: LayoutPoint, className: string): SVGTextElement {
  const label = svg('text', { x: point.x, y: point.y - 7, class: `port-label ${className}` });
  label.textContent = value;
  return label;
}

function pathData(points: LayoutPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

function required<T extends HTMLElement | SVGElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
}

function showStatus(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle('error', error);
  status.classList.remove('hidden');
}

function hideStatus(): void { status.classList.add('hidden'); }

function componentComposition(module: QsysModule): QsysGraph | undefined {
  const component = sourceGraph?.component;
  return component?.mode === 'composition' && component.moduleId === module.id
    ? component.composition
    : undefined;
}

function componentExpandControl(module: QsysModule, nodeWidth: number): SVGGElement {
  const control = svg('g', {
    class: 'node-subsystem-control node-component-control',
    transform: `translate(${Math.max(0, nodeWidth - 32)} 0)`,
    tabindex: '0',
    role: 'button',
    'aria-label': `Expand component ${module.name}`,
  });
  const symbol = svg('text', { x: 16, y: 20 });
  symbol.textContent = '+';
  control.append(svg('circle', { cx: 16, cy: 16, r: 10 }), symbol);
  const title = svg('title');
  title.textContent = `Expand the internal composition of ${module.name}`;
  control.append(title);
  const expand = (event: Event) => {
    event.stopPropagation();
    expandComponentComposition();
  };
  control.addEventListener('click', expand);
  control.addEventListener('dblclick', (event) => event.stopPropagation());
  control.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    if (key === 'Enter' || key === ' ') expand(event);
  });
  return control;
}

function expandComponentComposition(): void {
  const component = sourceGraph?.component;
  if (!component?.composition) return;
  expandedSubsystems.set(component.moduleId, component.composition);
  refreshComposedHierarchy();
}

function subsystemExpandControl(module: QsysModule, nodeWidth: number): SVGGElement {
  const control = svg('g', {
    class: 'node-subsystem-control',
    transform: `translate(${Math.max(0, nodeWidth - 32)} 0)`,
    tabindex: '0',
    role: 'button',
    'aria-label': `Expand subsystem ${module.name}`,
  });
  const symbol = svg('text', { x: 16, y: 20 });
  symbol.textContent = loadingSubsystems.has(module.id) ? '…' : '+';
  control.append(svg('circle', { cx: 16, cy: 16, r: 10 }), symbol);
  const title = svg('title');
  title.textContent = `Expand ${module.name} on the current canvas`;
  control.append(title);
  const expand = (event: Event) => {
    event.stopPropagation();
    requestSubsystemExpansion(module);
  };
  control.addEventListener('click', expand);
  control.addEventListener('dblclick', (event) => event.stopPropagation());
  control.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    if (key === 'Enter' || key === ' ') expand(event);
  });
  return control;
}

function requestSubsystemExpansion(module: QsysModule): void {
  requestSubsystem(module, 'expand');
}

function requestSubsystemEntry(module: QsysModule): void {
  requestSubsystem(module, 'enter');
}

function requestSubsystem(module: QsysModule, action: 'expand' | 'enter'): void {
  if (!module.subsystem || loadingSubsystems.has(module.id)) return;
  loadingSubsystems.add(module.id);
  pendingSubsystemActions.set(module.id, action);
  if (action === 'expand') expandedSubsystemResources.set(module.id, module.subsystem.resource);
  details.classList.add('hidden');
  if (layout) draw(layout);
  vscode.postMessage({
    type: 'loadSubsystem',
    instanceId: module.id,
    resource: module.subsystem.resource,
    analyze: sourceGraph?.metadata.source === 'quartus',
  });
}

function enterSubsystem(child: QsysGraph, resource: string): void {
  if (!sourceGraph) return;
  navigationStack.push({
    sourceGraph,
    resource: activeResource,
    expandedSubsystems,
    expandedSubsystemResources,
    stableLayoutCaches,
    transform: { ...transform },
    didInitialFit,
    activeHubId,
    disabledConnectionIds,
  });
  sourceGraph = child;
  graph = child;
  activeResource = resource;
  expandedSubsystems = new Map();
  expandedSubsystemResources = new Map();
  stableLayoutCaches = {};
  disabledConnectionIds = new Set();
  layout = undefined;
  transform = { x: 20, y: 20, scale: 1 };
  didInitialFit = false;
  activeHubId = undefined;
  loadingSubsystems.clear();
  pendingSubsystemActions.clear();
  details.classList.add('hidden');
  required<HTMLElement>('system-name').textContent = sourceGraph.name;
  updateAnalysisControls();
  updateCurrentDiagnostics();
  updateExpandedSubsystemControls();
  updateSubsystemNavigation();
  updateKindFilters();
  void render();
}

function leaveSubsystem(): void {
  const parent = navigationStack.pop();
  if (!parent) return;
  sourceGraph = parent.sourceGraph;
  activeResource = parent.resource;
  expandedSubsystems = parent.expandedSubsystems;
  expandedSubsystemResources = parent.expandedSubsystemResources;
  stableLayoutCaches = parent.stableLayoutCaches;
  transform = parent.transform;
  didInitialFit = parent.didInitialFit;
  activeHubId = parent.activeHubId;
  disabledConnectionIds = parent.disabledConnectionIds;
  graph = composeHierarchy(sourceGraph, expandedSubsystems);
  layout = undefined;
  loadingSubsystems.clear();
  pendingSubsystemActions.clear();
  details.classList.add('hidden');
  required<HTMLElement>('system-name').textContent = sourceGraph.name;
  updateAnalysisControls();
  updateCurrentDiagnostics();
  updateExpandedSubsystemControls();
  updateSubsystemNavigation();
  updateKindFilters();
  void render();
}

function updateSubsystemNavigation(): void {
  subsystemNavigation.classList.toggle('hidden', navigationStack.length === 0);
  subsystemPath.textContent = sourceGraph
    ? [...navigationStack.map((frame) => frame.sourceGraph.name), sourceGraph.name].join(' › ')
    : '';
}

function updateAnalysisControls(): void {
  const exact = Boolean(sourceGraph) && sourceGraph!.metadata.source !== 'qsys-only'
    && [...expandedSubsystems.values()].every((child) => child.metadata.source !== 'qsys-only');
  const isComponent = Boolean(sourceGraph?.component);
  componentToggle.classList.toggle('hidden', !sourceGraph?.component);
  quartusMetadata.classList.toggle('hidden', Boolean(exact || isComponent));
  openPlatformDesigner.classList.toggle('hidden', isComponent);
  inferClockResetOption.classList.toggle('hidden', Boolean(exact));
  quartusMetadata.disabled = false;
  quartusMetadata.textContent = 'Read interfaces…';
  quartusMetadata.title = 'Read exact elaborated interface metadata with qsys-script';
  updateViewAvailability();
}

function updateViewAvailability(): void {
  const available = canUsePipelineView([
    { resource: activeResource, exactMetadata: Boolean(sourceGraph) && sourceGraph!.metadata.source !== 'qsys-only' },
    ...[...expandedSubsystemResources].map(([instanceId, resource]) => ({
      resource,
      exactMetadata: Boolean(expandedSubsystems.get(instanceId))
        && expandedSubsystems.get(instanceId)!.metadata.source !== 'qsys-only',
    })),
  ]);
  const unavailable = !available;
  pipelineViewOption.disabled = unavailable;
  viewMode.title = unavailable
    ? 'Pipeline view requires Read interfaces for this Tcl hierarchy.'
    : '';
  if (unavailable && state.viewMode === 'pipeline') {
    state.viewMode = 'complete';
    viewMode.value = 'complete';
    activeHubId = undefined;
    didInitialFit = false;
  }
}

function updateInactiveResourceGraph(resource: string, nextGraph: QsysGraph): void {
  let changedCurrentHierarchy = false;
  for (const [instanceId, expandedResource] of expandedSubsystemResources) {
    if (expandedResource !== resource || !expandedSubsystems.has(instanceId)) continue;
    expandedSubsystems.set(instanceId, nextGraph);
    changedCurrentHierarchy = true;
  }
  updateNavigationResourceGraph(resource, nextGraph);
  if (changedCurrentHierarchy) refreshComposedHierarchy();
}

function updateNavigationResourceGraph(resource: string, nextGraph: QsysGraph): void {
  for (const frame of navigationStack) {
    if (frame.resource === resource) frame.sourceGraph = nextGraph;
    for (const [instanceId, expandedResource] of frame.expandedSubsystemResources) {
      if (expandedResource === resource && frame.expandedSubsystems.has(instanceId)) {
        frame.expandedSubsystems.set(instanceId, nextGraph);
      }
    }
  }
}

function collapseSubsystem(instanceId: string): void {
  for (const id of [...expandedSubsystems.keys()]) {
    if (id === instanceId || id.startsWith(`${instanceId}/`)) {
      expandedSubsystems.delete(id);
      expandedSubsystemResources.delete(id);
    }
  }
  refreshComposedHierarchy();
}

function analyzeExpandedSubsystems(): void {
  for (const [instanceId, child] of expandedSubsystems) {
    const resource = expandedSubsystemResources.get(instanceId);
    if (child.metadata.source === 'quartus' || !resource || loadingSubsystems.has(instanceId)) continue;
    loadingSubsystems.add(instanceId);
    vscode.postMessage({ type: 'loadSubsystem', instanceId, resource, analyze: true });
  }
}

function refreshComposedHierarchy(): void {
  if (!sourceGraph) return;
  graph = composeHierarchy(sourceGraph, expandedSubsystems);
  delete stableLayoutCaches.pipeline;
  delete stableLayoutCaches.complete;
  activeHubId = undefined;
  didInitialFit = false;
  details.classList.add('hidden');
  updateCurrentDiagnostics();
  updateExpandedSubsystemControls();
  updateAnalysisControls();
  updateKindFilters();
  void render();
}

function updateExpandedSubsystemControls(): void {
  expandedSubsystemControls.replaceChildren();
  expandedSubsystemControls.classList.toggle('hidden', expandedSubsystems.size === 0);
  for (const instanceId of expandedSubsystems.keys()) {
    const collapse = document.createElement('button');
    collapse.className = 'expanded-subsystem';
    collapse.textContent = `− ${instanceId}`;
    collapse.title = `Collapse subsystem ${instanceId}`;
    collapse.addEventListener('click', () => collapseSubsystem(instanceId));
    expandedSubsystemControls.append(collapse);
  }
}

function updateDiagnostics(diagnostics: QsysDiagnostic[]): void {
  const wasOpen = !diagnosticsPanel.classList.contains('hidden');
  diagnosticsList.replaceChildren();
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warningCount = diagnostics.length - errorCount;
  diagnosticsToggle.classList.toggle('hidden', diagnostics.length === 0);
  diagnosticsToggle.classList.toggle('has-errors', errorCount > 0);
  diagnosticsToggle.textContent = [
    errorCount > 0 ? `${errorCount} error${errorCount === 1 ? '' : 's'}` : '',
    warningCount > 0 ? `${warningCount} warning${warningCount === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ');

  for (const diagnostic of diagnostics) {
    const item = document.createElement('button');
    item.className = `diagnostic diagnostic-${diagnostic.severity}`;
    const location = document.createElement('span');
    location.textContent = diagnostic.line ? `Line ${diagnostic.line}` : diagnostic.severity;
    const message = document.createElement('strong');
    message.textContent = diagnostic.message;
    item.append(location, message);
    if (diagnostic.line) {
      item.title = `Open source at line ${diagnostic.line}`;
      item.addEventListener('click', () => {
        vscode.postMessage({ type: 'revealDiagnostic', line: diagnostic.line, resource: activeResource });
      });
    } else {
      item.disabled = true;
    }
    diagnosticsList.append(item);
  }
  diagnosticsPanel.classList.toggle('hidden', diagnostics.length === 0 || !wasOpen);
}

function updateCurrentDiagnostics(): void {
  updateDiagnostics([
    ...(graph?.diagnostics ?? []),
    ...connectionDiagnostics(graph?.connections ?? []),
  ]);
}
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function truncate(value: string, length: number): string { return value.length > length ? `${value.slice(0, length - 1)}…` : value; }
function saveState(): void {
  vscode.setState(state);
  vscode.postMessage({ type: 'viewStateChanged', state });
}

function selectedKinds(): ConnectionKind[] { return state.selectedKinds[state.viewMode]; }

function updateKindFilters(): void {
  const inferredConnections = inferClockResetConnections(graph?.connections ?? [], state.inferClockResetNames);
  const exportKinds = graph ? collectExportedInterfaces(graph).map((item) => item.kind) : [];
  const available = new Set(availableConnectionKinds([
    ...inferredConnections.map((connection) => connection.kind),
    ...exportKinds,
  ], state.viewMode));
  for (const [kind, elements] of filterCheckboxes) {
    elements.checkbox.checked = selectedKinds().includes(kind);
    elements.label.classList.toggle('hidden', !available.has(kind));
  }
}

function applySavedViewState(value: SavedViewState): void {
  if (value.viewMode === 'pipeline' || value.viewMode === 'complete') state.viewMode = value.viewMode;
  const legacyPipeline = Array.isArray(value.selectedKinds) ? value.selectedKinds : value.selectedKinds?.pipeline;
  const complete = Array.isArray(value.selectedKinds) ? undefined : value.selectedKinds?.complete;
  if (legacyPipeline) state.selectedKinds.pipeline = validConnectionKinds(legacyPipeline);
  if (complete) state.selectedKinds.complete = validConnectionKinds(complete);
  if (typeof value.showDisconnected === 'boolean') state.showDisconnected = value.showDisconnected;
  if (typeof value.showDisabled === 'boolean') state.showDisabled = value.showDisabled;
  if (typeof value.inferClockResetNames === 'boolean') state.inferClockResetNames = value.inferClockResetNames;
}

function validConnectionKinds(values: readonly ConnectionKind[]): ConnectionKind[] {
  return values.filter((kind): kind is ConnectionKind => connectionKinds.includes(kind));
}

function syncViewControls(): void {
  viewMode.value = state.viewMode;
  inferClockResetNames.checked = state.inferClockResetNames;
  showDisconnected.checked = state.showDisconnected;
  showDisabled.checked = state.showDisabled;
  updateKindFilters();
}

vscode.postMessage({ type: 'ready' });
