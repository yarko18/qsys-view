// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { connectionKinds, type ConnectionKind, type QsysAdaptation, type QsysConnection, type QsysDiagnostic, type QsysGraph, type QsysInterface, type QsysModule } from '../parser/graph';
import { streamParameters } from '../parser/streamMetadata';
import { createInterfaceWaveform } from '../parser/waveform';
import { layoutAnchoredGraph, layoutGraph, layoutStableGraph, pathMidpoint, projectVisibleLayout, separateHierarchyGroups, type LayoutPoint, type LayoutResult, type StableLayoutCache } from '../layout/elk';
import { composeHierarchy, hierarchyBounds, type HierarchyBounds } from './hierarchy';
import { connectionAddress, createInterfaceHubs, type HubKind, type InterfaceHub } from './interfaceHubs';
import { availableConnectionKinds, canUsePipelineView, connectedModuleIds, inferClockResetConnections, isDirectKind, isHubKind, type GraphViewMode } from './viewMode';
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
let renderVersion = 0;
let transform: CanvasTransform = { x: 20, y: 20, scale: 1 };
let didInitialFit = false;

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
      <button id="diagnostics-toggle" class="diagnostics-toggle hidden" title="Show Tcl parse problems"></button>
      <button id="quartus-metadata" title="Read exact interface metadata with qsys-script">Read interfaces…</button>
      <button id="open-platform-designer" title="Open this design in Intel Platform Designer">Open in Platform Designer</button>
      <button id="relayout" title="Recalculate the current layout">Relayout</button>
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
required<HTMLButtonElement>('subsystem-back').addEventListener('click', leaveSubsystem);
diagnosticsToggle.addEventListener('click', () => diagnosticsPanel.classList.toggle('hidden'));
required<HTMLButtonElement>('diagnostics-close').addEventListener('click', () => diagnosticsPanel.classList.add('hidden'));
required<HTMLButtonElement>('relayout').addEventListener('click', () => {
  delete stableLayoutCaches[state.viewMode];
  activeHubId = undefined;
  didInitialFit = false;
  void render();
});
quartusMetadata.addEventListener('click', () => {
  quartusMetadata.disabled = true;
  quartusMetadata.textContent = 'Running qsys-script…';
  showStatus(isActiveTcl()
    ? 'Quartus is evaluating this Tcl system in a disposable directory…'
    : 'Quartus is elaborating a temporary copy of this Qsys system…');
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
    sourceGraph = message.graph;
    graph = composeHierarchy(sourceGraph, expandedSubsystems);
    if (firstGraph) didInitialFit = false;
    required<HTMLElement>('system-name').textContent = sourceGraph.name;
    updateAnalysisControls();
    updateDiagnostics(graph.diagnostics ?? []);
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
  const inferredConnections = inferClockResetConnections(graph.connections, state.inferClockResetNames);
  const renderedGraph = { ...graph, connections: inferredConnections };
  const allowedConnections = inferredConnections.filter((connection) =>
    allowedIds.has(connection.source) && allowedIds.has(connection.target),
  );
  const enabledKinds = selectedKinds().filter((kind) => isDirectKind(kind, state.viewMode) || isHubKind(kind, state.viewMode));
  const selectedConnections = allowedConnections.filter((connection) => enabledKinds.includes(connection.kind));
  const connections = selectedConnections.filter((connection) => isDirectKind(connection.kind, state.viewMode));
  const selectedHubKinds = enabledKinds.filter((kind) => isHubKind(kind, state.viewMode));
  const hubs = createInterfaceHubs(renderedGraph, selectedHubKinds, allowedIds);
  const connectedIds = connectedModuleIds(connections, hubs);
  const modules = state.showDisconnected
    ? allowedModules
    : allowedModules.filter((module) => connectedIds.has(module.id));
  try {
    const structuralConnections = allowedConnections.filter((connection) => isDirectKind(connection.kind, state.viewMode));
    const mode = state.viewMode;
    if (!stableLayoutCaches[mode]) {
      showStatus(state.viewMode === 'pipeline' && structuralConnections.some((connection) => connection.kind === 'avalon_streaming')
        ? 'Calculating Avalon-ST anchored layout…'
        : `Calculating ${state.viewMode === 'complete' ? 'Classic' : 'Pipeline'} layout…`);
    }
    const baseLayout = mode === 'pipeline' ? layoutAnchoredGraph : layoutGraph;
    const stable = await layoutStableGraph(
      allowedModules,
      structuralConnections,
      stableLayoutCaches[mode],
      async (layoutModules, layoutConnections) => separateHierarchyGroups(
        await baseLayout(layoutModules, layoutConnections),
        [...expandedSubsystems.keys()],
      ),
    );
    if (version !== renderVersion) return;
    stableLayoutCaches[mode] = stable.cache;
    const result = projectVisibleLayout(stable.layout, modules, connections);
    layout = result;
    draw(result);
    visibleHubs = hubs;
    if (activeHubId && !hubs.some((hub) => hub.id === activeHubId)) activeHubId = undefined;
    drawInterfaceHubs(hubs);
    const visibleConnectionCount = selectedConnections.length;
    required<HTMLElement>('summary').textContent = `${modules.length}/${graph.modules.length} IP · ${visibleConnectionCount}/${allowedConnections.length} interfaces`;
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
    const group = svg('g', {
      class: `edge edge-${edge.kind}`,
      tabindex: '0',
      role: 'button',
    });
    for (const points of edge.paths) {
      group.append(svg('path', {
        d: pathData(points),
        class: 'edge-hit',
      }));
      group.append(svg('path', {
        d: pathData(points),
        class: 'edge-line',
        'marker-end': `url(#arrow-${edge.kind})`,
      }));
      if (points.length > 0) {
        group.append(edgeLabel(edge.sourcePort, points[0]!, 'source-port'));
        group.append(edgeLabel(edge.targetPort, points.at(-1)!, 'target-port'));
      }
    }
    if (edge.adaptations && edge.adaptations.length > 0) {
      const midpoint = pathMidpoint(edge.paths);
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
    title.textContent = [
      `${edge.source}.${edge.sourcePort} → ${edge.target}.${edge.targetPort}`,
      `${labels[edge.kind]} (${edge.rawKind})`,
      adapterSummary,
    ].filter(Boolean).join('\n');
    group.append(title);
    const openDetails = (event: Event) => {
      event.stopPropagation();
      showConnectionDetails(edge);
    };
    group.addEventListener('click', openDetails);
    group.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Enter') openDetails(event);
    });
    scene.append(group);
  }
  for (const node of result.nodes) {
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
    const openDetails = (event: Event) => {
      event.stopPropagation();
      showModuleDetails(node);
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
    drawHierarchyEnterControl(container.instanceId, container.bounds);
    drawHierarchyCollapseControl(container.instanceId, container.bounds);
  }
  createMarkers();
  applyTransform();
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

function showModuleDetails(module: QsysModule): void {
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
  details.append(parameterTable('Parameters', module.parameters));
  details.classList.remove('hidden');
}

function showConnectionDetails(connection: QsysConnection): void {
  if (!graph) return;
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
  close.addEventListener('click', () => details.classList.add('hidden'));
  return close;
}

function parameterTable(titleText: string, parameters: Record<string, string>): HTMLElement {
  const section = document.createElement('section');
  const title = document.createElement('h3');
  title.textContent = titleText;
  const table = document.createElement('dl');
  const entries = Object.entries(parameters);
  for (const [name, value] of entries) appendDefinition(table, name, value);
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-parameters';
    empty.textContent = 'Not serialized in this Qsys file.';
    table.append(empty);
  }
  section.append(title, table);
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
  });
  sourceGraph = child;
  graph = child;
  activeResource = resource;
  expandedSubsystems = new Map();
  expandedSubsystemResources = new Map();
  stableLayoutCaches = {};
  layout = undefined;
  transform = { x: 20, y: 20, scale: 1 };
  didInitialFit = false;
  activeHubId = undefined;
  loadingSubsystems.clear();
  pendingSubsystemActions.clear();
  details.classList.add('hidden');
  required<HTMLElement>('system-name').textContent = sourceGraph.name;
  updateAnalysisControls();
  updateDiagnostics(sourceGraph.diagnostics ?? []);
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
  graph = composeHierarchy(sourceGraph, expandedSubsystems);
  layout = undefined;
  loadingSubsystems.clear();
  pendingSubsystemActions.clear();
  details.classList.add('hidden');
  required<HTMLElement>('system-name').textContent = sourceGraph.name;
  updateAnalysisControls();
  updateDiagnostics(sourceGraph.diagnostics ?? []);
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
  const exact = sourceGraph?.metadata.source === 'quartus'
    && [...expandedSubsystems.values()].every((child) => child.metadata.source === 'quartus');
  quartusMetadata.classList.toggle('hidden', Boolean(exact));
  inferClockResetOption.classList.toggle('hidden', Boolean(exact));
  quartusMetadata.disabled = false;
  quartusMetadata.textContent = isActiveTcl() ? 'Evaluate Tcl…' : 'Read interfaces…';
  quartusMetadata.title = isActiveTcl()
    ? 'Execute the Tcl with qsys-script and show its evaluated instances, parameters, connections, and interfaces'
    : 'Read exact interface metadata with qsys-script';
  updateViewAvailability();
}

function isActiveTcl(): boolean {
  return /\.tcl$/i.test(activeResource ?? '');
}

function updateViewAvailability(): void {
  const available = canUsePipelineView([
    { resource: activeResource, exactMetadata: sourceGraph?.metadata.source === 'quartus' },
    ...[...expandedSubsystemResources].map(([instanceId, resource]) => ({
      resource,
      exactMetadata: expandedSubsystems.get(instanceId)?.metadata.source === 'quartus',
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
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function truncate(value: string, length: number): string { return value.length > length ? `${value.slice(0, length - 1)}…` : value; }
function saveState(): void {
  vscode.setState(state);
  vscode.postMessage({ type: 'viewStateChanged', state });
}

function selectedKinds(): ConnectionKind[] { return state.selectedKinds[state.viewMode]; }

function updateKindFilters(): void {
  const inferredConnections = inferClockResetConnections(graph?.connections ?? [], state.inferClockResetNames);
  const available = new Set(availableConnectionKinds(inferredConnections.map((connection) => connection.kind), state.viewMode));
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
