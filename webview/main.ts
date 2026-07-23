// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { connectionKinds, type ConnectionKind, type QsysGraph, type QsysModule } from '../parser/graph';
import { layoutGraph, type LayoutPoint, type LayoutResult } from '../layout/elk';
import './styles.css';

const vscode = acquireVsCodeApi();
const labels: Record<ConnectionKind, string> = {
  avalon_streaming: 'Avalon-ST',
  avalon_memory_mapped: 'Avalon-MM',
  clock: 'Clock',
  reset: 'Reset',
  interrupt: 'Interrupt',
  conduit: 'Conduit',
  other: 'Other',
};

interface ViewState {
  selectedKinds: ConnectionKind[];
  showDisconnected: boolean;
  showDisabled: boolean;
}

const saved = (vscode.getState() ?? {}) as Partial<ViewState>;
const state: ViewState = {
  selectedKinds: saved.selectedKinds ?? ['avalon_streaming'],
  showDisconnected: saved.showDisconnected ?? false,
  showDisabled: saved.showDisabled ?? true,
};

let graph: QsysGraph | undefined;
let layout: LayoutResult | undefined;
let renderVersion = 0;
let transform = { x: 20, y: 20, scale: 1 };
let didInitialFit = false;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Qsys Viewer root element is missing.');
app.innerHTML = `
  <header class="toolbar">
    <div class="brand"><strong id="system-name">Qsys Viewer</strong><span id="summary"></span></div>
    <div id="kind-filters" class="filters"></div>
    <label class="option"><input id="show-disconnected" type="checkbox"> All IP</label>
    <label class="option"><input id="show-disabled" type="checkbox"> Disabled IP</label>
    <input id="search" class="search" type="search" placeholder="Find IP…" aria-label="Find IP">
    <button id="fit" title="Fit graph to view">Fit</button>
  </header>
  <main id="viewport" class="viewport">
    <svg id="canvas" aria-label="Qsys system graph">
      <defs id="definitions"></defs>
      <g id="scene"></g>
    </svg>
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

for (const kind of connectionKinds) {
  const label = document.createElement('label');
  label.className = `kind-filter kind-${kind}`;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = state.selectedKinds.includes(kind);
  checkbox.addEventListener('change', () => {
    state.selectedKinds = checkbox.checked
      ? [...state.selectedKinds, kind]
      : state.selectedKinds.filter((selected) => selected !== kind);
    saveState();
    void render();
  });
  label.append(checkbox, document.createTextNode(labels[kind]));
  filters.append(label);
}

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
search.addEventListener('input', updateSearch);

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as { type?: string; graph?: QsysGraph; message?: string };
  if (message.type === 'graph' && message.graph) {
    graph = message.graph;
    didInitialFit = false;
    required<HTMLElement>('system-name').textContent = graph.name;
    void render();
  } else if (message.type === 'error') {
    showStatus(message.message ?? 'Unable to load Qsys file.', true);
  }
});

let pointer: { id: number; startX: number; startY: number; originX: number; originY: number } | undefined;
canvas.addEventListener('pointerdown', (event) => {
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
  showStatus('Calculating layered layout…');
  details.classList.add('hidden');
  const allowedModules = graph.modules.filter((module) => state.showDisabled || !module.disabled);
  const allowedIds = new Set(allowedModules.map((module) => module.id));
  const connections = graph.connections.filter((connection) =>
    state.selectedKinds.includes(connection.kind)
    && allowedIds.has(connection.source)
    && allowedIds.has(connection.target),
  );
  const connectedIds = new Set(connections.flatMap((connection) => [connection.source, connection.target]));
  const modules = state.showDisconnected
    ? allowedModules
    : allowedModules.filter((module) => connectedIds.has(module.id));
  try {
    const result = await layoutGraph(modules, connections);
    if (version !== renderVersion) return;
    layout = result;
    draw(result);
    required<HTMLElement>('summary').textContent = `${modules.length}/${graph.modules.length} IP · ${connections.length}/${graph.connections.length} links`;
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
  for (const edge of result.edges) {
    const group = svg('g', { class: `edge edge-${edge.kind}` });
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
    scene.append(group);
  }
  for (const node of result.nodes) {
    const group = svg('g', {
      class: `node${node.disabled ? ' disabled' : ''}`,
      transform: `translate(${node.x} ${node.y})`,
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
      showDetails(node);
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

function showDetails(module: QsysModule): void {
  details.replaceChildren();
  const close = document.createElement('button');
  close.className = 'details-close';
  close.textContent = '×';
  close.title = 'Close';
  close.addEventListener('click', () => details.classList.add('hidden'));
  const heading = document.createElement('h2');
  heading.textContent = module.name;
  const type = document.createElement('div');
  type.className = 'details-type';
  type.textContent = `${module.type}${module.disabled ? ' · disabled' : ''}`;
  const title = document.createElement('h3');
  title.textContent = 'Parameters';
  const table = document.createElement('dl');
  const entries = Object.entries(module.parameters);
  for (const [name, value] of entries) {
    const term = document.createElement('dt');
    term.textContent = name;
    const definition = document.createElement('dd');
    definition.textContent = value;
    table.append(term, definition);
  }
  if (entries.length === 0) table.textContent = 'No parameters in the Qsys XML.';
  details.append(close, heading, type, title, table);
  details.classList.remove('hidden');
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

vscode.postMessage({ type: 'ready' });
