// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { exportedInterfaceLabelWidth, exportedInterfaceStubLength, layoutAnchoredGraph, layoutGraph, layoutStableGraph, pathMidpoint, portAnchorY, projectVisibleLayout, separateHierarchyGroups, type LayoutExternalPort } from '../layout/elk';
import type { ConnectionKind, QsysConnection, QsysModule } from '../parser/graph';

function module(id: string): QsysModule {
  return { id, name: id, type: 'test.ip', disabled: false, parameters: {}, ports: [] };
}

function connection(id: string, source: string, target: string, kind: ConnectionKind): QsysConnection {
  return {
    id,
    source,
    sourcePort: 'out',
    target,
    targetPort: 'in',
    kind,
    rawKind: kind,
    parameters: {},
  };
}

describe('Avalon-ST anchored layout', () => {
  it('does not move streaming nodes when non-streaming modules and links are added', async () => {
    const source = module('stream_source');
    const sink = module('stream_sink');
    const control = module('control_master');
    const peripheral = module('peripheral');
    const streaming = connection('st', source.id, sink.id, 'avalon_streaming');
    const memoryMapped = connection('mm', source.id, control.id, 'avalon_memory_mapped');
    const satelliteLink = connection('mm-satellite', control.id, peripheral.id, 'avalon_memory_mapped');

    const streamingOnly = await layoutAnchoredGraph([source, sink], [streaming]);
    const complete = await layoutAnchoredGraph(
      [source, sink, control, peripheral],
      [streaming, memoryMapped, satelliteLink],
    );

    for (const id of [source.id, sink.id]) {
      const before = streamingOnly.nodes.find((node) => node.id === id);
      const after = complete.nodes.find((node) => node.id === id);
      expect(after && { x: after.x, y: after.y }).toEqual(before && { x: before.x, y: before.y });
    }

    const stView = projectVisibleLayout(complete, [source, sink], [streaming]);
    const combinedView = projectVisibleLayout(complete, [source, sink, control], [streaming, memoryMapped]);
    for (const id of [source.id, sink.id]) {
      const before = stView.nodes.find((node) => node.id === id);
      const after = combinedView.nodes.find((node) => node.id === id);
      expect(after && { x: after.x, y: after.y }).toEqual(before && { x: before.x, y: before.y });
    }
    expect(combinedView.edges.find((edge) => edge.id === memoryMapped.id)?.paths[0]?.length).toBeGreaterThan(1);
  });
});

describe('pathMidpoint', () => {
  it('finds the halfway point across orthogonal segments', () => {
    expect(pathMidpoint([[
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ]])).toEqual({ x: 10, y: 5 });
  });
});

describe('expanded hierarchy layout', () => {
  it('does not move flat topology merely covered by an expanded hierarchy frame', () => {
    const top = { ...module('top'), x: 200, y: 50, width: 100, height: 70 };
    const first = { ...module('nested/first'), x: 100, y: 40, width: 100, height: 70 };
    const second = { ...module('nested/second'), x: 350, y: 40, width: 100, height: 70 };
    const link = connection('into-child', 'top', 'nested/first', 'avalon_streaming');
    const separated = separateHierarchyGroups({
      width: 500,
      height: 160,
      nodes: [top, first, second],
      edges: [{ ...link, paths: [[{ x: 300, y: 85 }, { x: 100, y: 75 }]] }],
    }, ['nested']);

    expect(separated.nodes.find((node) => node.id === 'top')?.y).toBe(50);
    expect(separated.nodes.find((node) => node.id === 'nested/first')?.y).toBe(40);
    expect(separated.nodes.find((node) => node.id === 'nested/second')?.y)
      .toBe(separated.nodes.find((node) => node.id === 'nested/first')?.y);
    const targetPoint = separated.edges[0]!.paths[0]!.at(-1)!;
    expect(targetPoint.x).toBe(first.x);
    expect(targetPoint.y).toBe(75);
  });

  it('ignores hidden descendants when protecting visible nodes from real overlaps', () => {
    const top = { ...module('top'), x: 200, y: 50, width: 100, height: 70 };
    const visible = { ...module('nested/coloring'), x: 350, y: 50, width: 100, height: 70 };
    const hidden = { ...module('nested/mm_control'), x: 200, y: 50, width: 100, height: 70 };
    const link = connection('into-child', 'top', 'nested/coloring', 'avalon_streaming');
    const separated = separateHierarchyGroups({
      width: 500,
      height: 160,
      nodes: [top, visible, hidden],
      edges: [{ ...link, paths: [[{ x: 300, y: 85 }, { x: 350, y: 85 }]] }],
    }, ['nested'], [], new Set(['top', 'nested/coloring']));

    expect(separated.nodes.find((node) => node.id === 'top')?.y).toBe(50);
    expect(separated.nodes.find((node) => node.id === 'nested/coloring')?.y).toBe(50);
    expect(separated.nodes.find((node) => node.id === 'nested/mm_control')?.y).toBe(50);
  });
});

describe('directed interface sides', () => {
  it('grows an IP so exported interface labels keep a readable vertical distance', async () => {
    const peripheral = module('peripherals');
    const externalPorts: LayoutExternalPort[] = Array.from({ length: 9 }, (_, index) => ({
      moduleId: peripheral.id,
      interfaceName: `external_${index}`,
      direction: 'input',
      label: `peripherals_external_interface_${index}`,
    }));
    const result = await layoutGraph([peripheral], [], externalPorts);
    const node = result.nodes[0]!;
    const anchors = externalPorts.map((port) => portAnchorY(
      node,
      port.direction,
      port.interfaceName,
      [],
      externalPorts,
    ));

    expect(node.height).toBeGreaterThan(70);
    for (let index = 1; index < anchors.length; index += 1) {
      expect(anchors[index]! - anchors[index - 1]!).toBeGreaterThanOrEqual(18);
    }
  });

  it('reserves horizontal room for a long exported label between adjacent IP', async () => {
    const source = module('nios2');
    const peripheral = module('peripherals');
    const link = connection('mm', source.id, peripheral.id, 'avalon_memory_mapped');
    const label = 'peripherals_wip_nconfig_nconfig_enable';
    const externalPorts: LayoutExternalPort[] = [{
      moduleId: peripheral.id,
      interfaceName: link.targetPort,
      direction: 'input',
      label,
    }];
    const result = await layoutGraph([source, peripheral], [link], externalPorts);
    const sourceNode = result.nodes.find((node) => node.id === source.id)!;
    const peripheralNode = result.nodes.find((node) => node.id === peripheral.id)!;
    const gap = peripheralNode.x - sourceNode.x - sourceNode.width;

    expect(gap).toBeGreaterThan(exportedInterfaceLabelWidth(label));
    expect(exportedInterfaceStubLength(label)).toBeLessThan(gap);
  });

  it('leaves a visible gap between long source and target labels', async () => {
    const source = module('video');
    const target = module('nios2');
    const sourcePort = 'capture_mem_master_wr';
    const targetPort = 'ram_port_3_wr';
    const link = {
      ...connection('write', source.id, target.id, 'avalon_memory_mapped'),
      sourcePort,
      targetPort,
    };
    const result = await layoutGraph([source, target], [link]);
    const sourceNode = result.nodes.find((node) => node.id === source.id)!;
    const targetNode = result.nodes.find((node) => node.id === target.id)!;
    const gap = targetNode.x - sourceNode.x - sourceNode.width;

    expect(gap).toBeGreaterThan(
      exportedInterfaceLabelWidth(sourcePort) + exportedInterfaceLabelWidth(targetPort),
    );
  });

  it('keeps inputs west and outputs east when two IP form a feedback cycle', async () => {
    const splitter = module('splitter');
    const compute = module('plateau_he_compute');
    const apply = module('plateau_he_apply');
    const linearize = module('linearize');
    const connections = [
      connection('compute-in', splitter.id, compute.id, 'avalon_streaming'),
      connection('video-data', compute.id, apply.id, 'avalon_streaming'),
      connection('apply-out', apply.id, linearize.id, 'avalon_streaming'),
      connection('histogram-feedback', apply.id, compute.id, 'avalon_memory_mapped'),
    ];
    const result = await layoutGraph([splitter, compute, apply, linearize], connections);
    const nodes = new Map(result.nodes.map((node) => [node.id, node]));

    for (const edge of result.edges) {
      const source = nodes.get(edge.source)!;
      const target = nodes.get(edge.target)!;
      expect(edge.paths[0]?.[0]?.x).toBeCloseTo(source.x + source.width);
      expect(edge.paths[0]?.at(-1)?.x).toBeCloseTo(target.x);
    }
  });

  it('routes a newly added feedback edge around frozen nodes', async () => {
    const left = module('left');
    const right = module('right');
    const initial = await layoutStableGraph(
      [left, right],
      [connection('forward', left.id, right.id, 'avalon_streaming')],
      undefined,
    );
    const feedback = connection('feedback', right.id, left.id, 'avalon_memory_mapped');
    const changed = await layoutStableGraph([left, right], [feedback], initial.cache);
    const source = changed.layout.nodes.find((node) => node.id === right.id)!;
    const target = changed.layout.nodes.find((node) => node.id === left.id)!;
    const path = changed.layout.edges[0]!.paths[0]!;

    expect(path[0]?.x).toBe(source.x + source.width);
    expect(path.at(-1)?.x).toBe(target.x);
    expect(Math.max(...path.map((point) => point.y)))
      .toBeGreaterThan(Math.max(source.y + source.height, target.y + target.height));
  });

  it('orders numbered switch inputs and outputs from top to bottom with even spacing', async () => {
    const source0 = module('source0');
    const source1 = module('source1');
    const switchIp = module('switch');
    const sink0 = module('sink0');
    const sink1 = module('sink1');
    const links = [
      { ...connection('in-1', source1.id, switchIp.id, 'avalon_streaming'), targetPort: 'din_1' },
      { ...connection('out-1', switchIp.id, sink1.id, 'avalon_streaming'), sourcePort: 'dout_1' },
      { ...connection('in-0', source0.id, switchIp.id, 'avalon_streaming'), targetPort: 'din_0' },
      { ...connection('out-0', switchIp.id, sink0.id, 'avalon_streaming'), sourcePort: 'dout_0' },
    ];
    const result = await layoutGraph([source0, source1, switchIp, sink0, sink1], links);
    const node = result.nodes.find((candidate) => candidate.id === switchIp.id)!;
    const endpoints = new Map(result.edges.map((edge) => [edge.id, {
      source: edge.paths[0]![0]!,
      target: edge.paths[0]!.at(-1)!,
    }]));

    expect(endpoints.get('in-0')!.target.x).toBeCloseTo(node.x);
    expect(endpoints.get('in-1')!.target.x).toBeCloseTo(node.x);
    expect(endpoints.get('out-0')!.source.x).toBeCloseTo(node.x + node.width);
    expect(endpoints.get('out-1')!.source.x).toBeCloseTo(node.x + node.width);
    expect(endpoints.get('in-0')!.target.y).toBeCloseTo(node.y + node.height / 3);
    expect(endpoints.get('in-1')!.target.y).toBeCloseTo(node.y + node.height * 2 / 3);
    expect(endpoints.get('out-0')!.source.y).toBeCloseTo(node.y + node.height / 3);
    expect(endpoints.get('out-1')!.source.y).toBeCloseTo(node.y + node.height * 2 / 3);
  });

  it('gives independent source domains separate slots on one shared slave interface', async () => {
    const cpu = module('cpu');
    const memory = module('memory');
    const data = {
      ...connection('data', cpu.id, memory.id, 'avalon_memory_mapped'),
      sourcePort: 'data_master',
      targetPort: 'avl_0',
    };
    const instruction = {
      ...connection('instruction', cpu.id, memory.id, 'avalon_memory_mapped'),
      sourcePort: 'instruction_master',
      targetPort: 'avl_0',
    };
    const result = await layoutGraph([cpu, memory], [data, instruction]);
    const endpoints = result.edges.map((edge) => edge.paths[0]!.at(-1)!);

    expect(endpoints[0]!.x).toBeCloseTo(endpoints[1]!.x);
    expect(Math.abs(endpoints[0]!.y - endpoints[1]!.y)).toBeGreaterThanOrEqual(18);
  });

  it('keeps proportional port anchors when links are added to a frozen layout', async () => {
    const switchIp = module('switch');
    const sink0 = module('sink0');
    const sink1 = module('sink1');
    const initial = await layoutStableGraph([switchIp, sink0, sink1], [], undefined);
    const links = [
      { ...connection('out-1', switchIp.id, sink1.id, 'avalon_streaming'), sourcePort: 'dout_1' },
      { ...connection('out-0', switchIp.id, sink0.id, 'avalon_streaming'), sourcePort: 'dout_0' },
    ];
    const changed = await layoutStableGraph([switchIp, sink0, sink1], links, initial.cache);
    const node = changed.layout.nodes.find((candidate) => candidate.id === switchIp.id)!;
    const starts = new Map(changed.layout.edges.map((edge) => [edge.id, edge.paths[0]![0]!]));

    expect(starts.get('out-0')!.y).toBeCloseTo(node.y + node.height / 3);
    expect(starts.get('out-1')!.y).toBeCloseTo(node.y + node.height * 2 / 3);
  });
});

describe('stable live layout', () => {
  it('keeps existing and temporarily removed IP fixed while connections and modules change', async () => {
    const source = module('source');
    const sink = module('sink');
    const added = module('added');
    const firstConnection = connection('first', source.id, sink.id, 'avalon_streaming');
    const initial = await layoutStableGraph([source, sink], [firstConnection], undefined);
    const initialPositions = new Map(initial.layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));

    const changedConnection = connection('changed', sink.id, source.id, 'conduit');
    const changed = await layoutStableGraph(
      [source, sink, added],
      [changedConnection],
      initial.cache,
    );
    for (const id of [source.id, sink.id]) {
      const node = changed.layout.nodes.find((candidate) => candidate.id === id);
      expect(node && { x: node.x, y: node.y }).toEqual(initialPositions.get(id));
    }
    expect(changed.layout.nodes.some((node) => node.id === added.id)).toBe(true);

    const removed = await layoutStableGraph([sink, added], [], changed.cache);
    const restored = await layoutStableGraph([source, sink, added], [], removed.cache);
    const restoredSource = restored.layout.nodes.find((node) => node.id === source.id);
    expect(restoredSource && { x: restoredSource.x, y: restoredSource.y }).toEqual(initialPositions.get(source.id));
  });
});
