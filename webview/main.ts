// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { connectionKinds, type ConnectionKind, type QsysConnection, type QsysGraph, type QsysInterface, type QsysModule } from '../parser/graph';
import { streamParameters } from '../parser/streamMetadata';
import { createInterfaceWaveform } from '../parser/waveform';
import { layoutAnchoredGraph, layoutGraph, projectVisibleLayout, type LayoutPoint, type LayoutResult } from '../layout/elk';
import { connectionAddress, createInterfaceHubs, type HubKind, type InterfaceHub } from './interfaceHubs';
import { isDirectKind, isHubKind, type GraphViewMode } from './viewMode';
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

interface ViewState {
  viewMode: GraphViewMode;
  selectedKinds: Record<GraphViewMode, ConnectionKind[]>;
  showDisconnected: boolean;
  showDisabled: boolean;
}

interface SavedViewState {
  viewMode?: GraphViewMode;
  selectedKinds?: ConnectionKind[] | Partial<Record<GraphViewMode, ConnectionKind[]>>;
  showDisconnected?: boolean;
  showDisabled?: boolean;
}

const saved = (vscode.getState() ?? {}) as SavedViewState;
const savedPipelineKinds = Array.isArray(saved.selectedKinds)
  ? saved.selectedKinds
  : saved.selectedKinds?.pipeline;
const state: ViewState = {
  viewMode: saved.viewMode ?? 'pipeline',
  selectedKinds: {
    pipeline: savedPipelineKinds ?? ['avalon_streaming', 'other'],
    complete: !Array.isArray(saved.selectedKinds) && saved.selectedKinds?.complete
      ? saved.selectedKinds.complete
      : [...connectionKinds],
  },
  showDisconnected: saved.showDisconnected ?? false,
  showDisabled: saved.showDisabled ?? true,
};

let graph: QsysGraph | undefined;
let layout: LayoutResult | undefined;
let masterLayout: LayoutResult | undefined;
let masterLayoutKey = '';
let activeHubId: string | undefined;
let visibleHubs: InterfaceHub[] = [];
let renderVersion = 0;
let transform = { x: 20, y: 20, scale: 1 };
let didInitialFit = false;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Qsys View root element is missing.');
app.innerHTML = `
  <header class="toolbar">
    <div class="brand"><strong id="system-name">Qsys View</strong><span id="summary"></span></div>
    <label class="view-mode">View
      <select id="view-mode" aria-label="Graph view mode">
        <option value="pipeline">Pipeline</option>
        <option value="complete">Complete</option>
      </select>
    </label>
    <div id="kind-filters" class="filters"></div>
    <label class="option"><input id="show-disconnected" type="checkbox"> All IP</label>
    <label class="option"><input id="show-disabled" type="checkbox"> Disabled IP</label>
    <input id="search" class="search" type="search" placeholder="Find IP…" aria-label="Find IP">
    <button id="quartus-metadata" title="Read exact interface metadata with qsys-script">Read interfaces…</button>
    <button id="fit" title="Fit graph to view">Fit</button>
  </header>
  <main id="viewport" class="viewport">
    <svg id="canvas" aria-label="Qsys system graph">
      <defs id="definitions"></defs>
      <g id="scene"></g>
    </svg>
    <div id="interface-hubs" class="interface-hubs hidden"></div>
    <div id="status" class="status">Loading Qsys graph…</div>
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
const quartusMetadata = required<HTMLButtonElement>('quartus-metadata');
const interfaceHubs = required<HTMLElement>('interface-hubs');

const filterCheckboxes = new Map<ConnectionKind, HTMLInputElement>();
for (const kind of filterKinds) {
  const label = document.createElement('label');
  label.className = `kind-filter kind-${kind}`;
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
  filterCheckboxes.set(kind, checkbox);
  label.append(checkbox, document.createTextNode(labels[kind]));
  filters.append(label);
}

viewMode.value = state.viewMode;
viewMode.addEventListener('change', () => {
  state.viewMode = viewMode.value as GraphViewMode;
  for (const [kind, checkbox] of filterCheckboxes) checkbox.checked = selectedKinds().includes(kind);
  activeHubId = undefined;
  didInitialFit = false;
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
quartusMetadata.addEventListener('click', () => {
  quartusMetadata.disabled = true;
  quartusMetadata.textContent = 'Running qsys-script…';
  showStatus('Quartus is elaborating a temporary copy of this Qsys system…');
  vscode.postMessage({ type: 'loadQuartusMetadata' });
});
search.addEventListener('input', updateSearch);

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as { type?: string; graph?: QsysGraph; message?: string };
  if (message.type === 'graph' && message.graph) {
    graph = message.graph;
    didInitialFit = false;
    required<HTMLElement>('system-name').textContent = graph.name;
    quartusMetadata.disabled = false;
    quartusMetadata.textContent = graph.metadata.source === 'quartus' ? 'Read interfaces again…' : 'Read interfaces…';
    void render();
  } else if (message.type === 'error') {
    showStatus(message.message ?? 'Unable to load Qsys file.', true);
  } else if (message.type === 'metadataError') {
    quartusMetadata.disabled = false;
    quartusMetadata.textContent = 'Retry Quartus metadata';
    showStatus(message.message ?? 'Unable to read interface metadata with Quartus.', true);
  } else if (message.type === 'metadataCancelled') {
    quartusMetadata.disabled = false;
    quartusMetadata.textContent = graph?.metadata.source === 'quartus' ? 'Read interfaces again…' : 'Read interfaces…';
    hideStatus();
  }
});

let pointer: { id: number; startX: number; startY: number; originX: number; originY: number } | undefined;
canvas.addEventListener('pointerdown', (event) => {
  if ((event.target as Element).closest('.node, .edge')) return;
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
  const allowedConnections = graph.connections.filter((connection) =>
    allowedIds.has(connection.source) && allowedIds.has(connection.target),
  );
  const selectedConnections = allowedConnections.filter((connection) =>
    selectedKinds().includes(connection.kind)
  );
  const connections = selectedConnections.filter((connection) => isDirectKind(connection.kind, state.viewMode));
  const selectedHubKinds = selectedKinds().filter((kind) => isHubKind(kind, state.viewMode));
  const hubs = createInterfaceHubs(graph, selectedHubKinds, allowedIds);
  const connectedIds = new Set(connections.flatMap((connection) => [connection.source, connection.target]));
  for (const hub of hubs) {
    for (const moduleId of hub.relatedModuleIds) connectedIds.add(moduleId);
  }
  const modules = state.showDisconnected
    ? allowedModules
    : allowedModules.filter((module) => connectedIds.has(module.id));
  try {
    const structuralConnections = allowedConnections.filter((connection) => isDirectKind(connection.kind, state.viewMode));
    const nextLayoutKey = layoutKey(allowedModules, structuralConnections, state.viewMode);
    let nextMaster = masterLayoutKey === nextLayoutKey ? masterLayout : undefined;
    if (!nextMaster) {
      showStatus(state.viewMode === 'pipeline' && structuralConnections.some((connection) => connection.kind === 'avalon_streaming')
        ? 'Calculating Avalon-ST anchored layout…'
        : `Calculating ${state.viewMode} layout…`);
      nextMaster = state.viewMode === 'pipeline'
        ? await layoutAnchoredGraph(allowedModules, structuralConnections)
        : await layoutGraph(allowedModules, structuralConnections);
      if (version !== renderVersion) return;
      masterLayout = nextMaster;
      masterLayoutKey = nextLayoutKey;
    }
    if (version !== renderVersion) return;
    const result = projectVisibleLayout(nextMaster, modules, connections);
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

function layoutKey(modules: QsysModule[], connections: QsysConnection[], mode: GraphViewMode): string {
  return JSON.stringify({
    mode,
    modules: modules.map((module) => [module.id, module.name]),
    connections: connections.map((connection) => [
      connection.id,
      connection.source,
      connection.target,
      connection.kind,
    ]),
  });
}

function draw(result: LayoutResult): void {
  scene.replaceChildren();
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
    const title = svg('title');
    title.textContent = `${edge.source}.${edge.sourcePort} → ${edge.target}.${edge.targetPort}\n${labels[edge.kind]} (${edge.rawKind})`;
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
      class: `node${node.disabled ? ' disabled' : ''}`,
      transform: `translate(${node.x} ${node.y})`,
      'data-module-id': node.id,
      'data-search': `${node.name} ${node.type}`.toLowerCase(),
      tabindex: '0',
      role: 'button',
    });
    group.append(svg('rect', { width: node.width, height: node.height, rx: 7 }));
    const name = svg('text', { x: 14, y: 29, class: 'node-name' });
    name.textContent = truncate(node.name, 28);
    const kind = svg('text', { x: 14, y: 51, class: 'node-kind' });
    kind.textContent = truncate(node.type, 34);
    group.append(name, kind);
    const openDetails = (event: Event) => {
      event.stopPropagation();
      showModuleDetails(node);
    };
    group.addEventListener('click', openDetails);
    group.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Enter') openDetails(event);
    });
    scene.append(group);
  }
  createMarkers();
  applyTransform();
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
  details.append(close, heading, type, parameterTable('Parameters', module.parameters));
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
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function truncate(value: string, length: number): string { return value.length > length ? `${value.slice(0, length - 1)}…` : value; }
function saveState(): void { vscode.setState(state); }

function selectedKinds(): ConnectionKind[] { return state.selectedKinds[state.viewMode]; }

vscode.postMessage({ type: 'ready' });
