import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowRight,
  GitBranch,
  Grid3X3,
  Layers,
  Orbit,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';

interface ApiNode {
  id: string;
  label: string;
  entity_type: string;
  domain: string;
}

interface ApiEdge {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  predicate: string;
  valid_from: string;
  valid_until: string | null;
  confidence: number;
  freshness: number;
  claim_id: string | null;
  is_historical: number;
  claim_status?: string;
  normalized_claim?: string;
}

type LayoutMode = 'flow' | 'orbit' | 'grid';

interface EntityNodeData extends Record<string, unknown> {
  label: string;
  entityType: string;
  domain: string;
  degree: number;
  hasHistorical: boolean;
  hasActive: boolean;
  isSelected: boolean;
  isDimmed: boolean;
}

function getEntityAccent(entityType: string): { dot: string; text: string } {
  const normalized = entityType.toLowerCase();
  if (normalized.includes('org') || normalized.includes('company')) {
    return { dot: 'bg-teal-500', text: 'text-teal-600 dark:text-teal-400' };
  }
  if (normalized.includes('person') || normalized.includes('leader')) {
    return { dot: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400' };
  }
  if (normalized.includes('date') || normalized.includes('time') || normalized.includes('number') || normalized.includes('metric')) {
    return { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' };
  }
  if (normalized.includes('place') || normalized.includes('location') || normalized.includes('country')) {
    return { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' };
  }
  return { dot: 'bg-indigo-500', text: 'text-indigo-600 dark:text-indigo-400' };
}

function EntityNodeCard({ data }: NodeProps<Node<EntityNodeData>>) {
  const accent = getEntityAccent(data.entityType);

  return (
    <div
      className={`w-[232px] rounded-xl border transition-all duration-150 px-3.5 py-3 shadow-sm ${
        data.isSelected
          ? 'bg-white dark:bg-[#171B22] border-teal-500 ring-2 ring-teal-500/30 shadow-lg shadow-teal-500/10'
          : 'bg-white/95 dark:bg-[#13151A]/95 border-zinc-200 dark:border-zinc-800 hover:border-teal-500/60'
      } ${data.isDimmed ? 'opacity-25' : 'opacity-100'}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-teal-500 !border-2 !border-white dark:!border-[#13151A]"
      />
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${accent.dot}`} />
          <span className={`text-[10px] font-semibold uppercase tracking-wider truncate ${accent.text}`}>
            {data.entityType}
          </span>
        </div>
        <span className="text-[10px] font-mono tabular-nums text-zinc-400 dark:text-zinc-500 shrink-0">
          {data.degree} {data.degree === 1 ? 'link' : 'links'}
        </span>
      </div>

      <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">
        {data.label}
      </div>

      <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
        <span className="truncate">{data.domain}</span>
        <span className="font-mono shrink-0">
          {data.hasActive && data.hasHistorical
            ? 'Active + Hist'
            : data.hasHistorical
              ? 'Historical'
              : 'Active'}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-teal-500 !border-2 !border-white dark:!border-[#13151A]"
      />
    </div>
  );
}

const NODE_TYPES = {
  entity: EntityNodeCard,
};

function computeNodePositions(
  nodes: ApiNode[],
  edges: ApiEdge[],
  mode: LayoutMode,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return positions;

  if (mode === 'grid') {
    const cols = Math.max(2, Math.ceil(Math.sqrt(nodes.length)));
    nodes.forEach((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.set(n.id, { x: 60 + col * 290, y: 60 + row * 165 });
    });
    return positions;
  }

  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  nodes.forEach((n) => {
    inDeg.set(n.id, 0);
    outDeg.set(n.id, 0);
  });
  edges.forEach((e) => {
    outDeg.set(e.source_entity_id, (outDeg.get(e.source_entity_id) ?? 0) + 1);
    inDeg.set(e.target_entity_id, (inDeg.get(e.target_entity_id) ?? 0) + 1);
  });

  if (mode === 'orbit') {
    const sorted = [...nodes].sort(
      (a, b) =>
        (inDeg.get(b.id)! + outDeg.get(b.id)!) - (inDeg.get(a.id)! + outDeg.get(a.id)!),
    );
    const hubCount = Math.min(3, Math.max(1, Math.floor(sorted.length / 4)));
    const hubs = sorted.slice(0, hubCount);
    const satellites = sorted.slice(hubCount);

    const centerX = 520;
    const centerY = 320;
    if (hubs.length === 1) {
      positions.set(hubs[0].id, { x: centerX, y: centerY });
    } else {
      hubs.forEach((hub, idx) => {
        const angle = (idx / hubs.length) * Math.PI * 2 - Math.PI / 2;
        positions.set(hub.id, {
          x: centerX + Math.cos(angle) * 190,
          y: centerY + Math.sin(angle) * 150,
        });
      });
    }

    const outerRadiusX = Math.max(380, satellites.length * 42);
    const outerRadiusY = Math.max(280, satellites.length * 32);
    satellites.forEach((node, idx) => {
      const angle = (idx / Math.max(1, satellites.length)) * Math.PI * 2 - Math.PI / 2;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * outerRadiusX,
        y: centerY + Math.sin(angle) * outerRadiusY,
      });
    });
    return positions;
  }

  // Default 'flow': Layered Subject -> Bridge -> Object layout
  const layer = new Map<string, number>();
  nodes.forEach((n) => {
    const incoming = inDeg.get(n.id) ?? 0;
    const outgoing = outDeg.get(n.id) ?? 0;
    if (outgoing > 0 && incoming === 0) {
      layer.set(n.id, 0);
    } else if (outgoing > 0 && incoming > 0) {
      layer.set(n.id, 1);
    } else if (incoming > 0 && outgoing === 0) {
      layer.set(n.id, 2);
    } else {
      layer.set(n.id, 0);
    }
  });

  // Ensure nodes in layer 2 that receive edges from layer 1 stay at layer 2+, and relax one pass
  for (let pass = 0; pass < 2; pass += 1) {
    edges.forEach((e) => {
      const srcL = layer.get(e.source_entity_id) ?? 0;
      const tgtL = layer.get(e.target_entity_id) ?? 1;
      if (tgtL <= srcL && srcL < 3) {
        layer.set(e.target_entity_id, srcL + 1);
      }
    });
  }

  const buckets = new Map<number, ApiNode[]>();
  nodes.forEach((n) => {
    const l = layer.get(n.id) ?? 0;
    const arr = buckets.get(l) ?? [];
    arr.push(n);
    buckets.set(l, arr);
  });

  const sortedLayers = [...buckets.keys()].sort((a, b) => a - b);
  const maxRows = Math.max(...[...buckets.values()].map((b) => b.length), 1);
  const rowStep = 152;
  const colStep = 340;

  sortedLayers.forEach((l, colIdx) => {
    const bucket = buckets.get(l) ?? [];
    // Sort within column by degree descending for cleaner clustering
    bucket.sort(
      (a, b) =>
        (inDeg.get(b.id)! + outDeg.get(b.id)!) - (inDeg.get(a.id)! + outDeg.get(a.id)!),
    );
    const totalHeight = (bucket.length - 1) * rowStep;
    const fullHeight = (maxRows - 1) * rowStep;
    const yOffset = 60 + (fullHeight - totalHeight) / 2;

    bucket.forEach((n, rowIdx) => {
      positions.set(n.id, {
        x: 60 + colIdx * colStep,
        y: yOffset + rowIdx * rowStep,
      });
    });
  });

  return positions;
}

function GraphCanvasInner({
  flowNodes,
  flowEdges,
  isDark,
  onSelectNode,
  onSelectEdge,
  onClearSelection,
}: {
  flowNodes: Node<EntityNodeData>[];
  flowEdges: Edge[];
  isDark: boolean;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onClearSelection: () => void;
}) {
  const { fitView } = useReactFlow();

  const handleResetView = useCallback(() => {
    void fitView({ padding: 0.18, duration: 300 });
  }, [fitView]);

  return (
    <div className="relative h-[580px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#F4F5F6] dark:bg-[#0B0C0E] overflow-hidden">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.25}
        maxZoom={1.75}
        onPaneClick={onClearSelection}
        onNodeClick={(_evt, node) => onSelectNode(node.id)}
        onEdgeClick={(_evt, edge) => onSelectEdge(edge.id)}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color={isDark ? '#27272a' : '#d4d4d8'}
          gap={22}
          size={1.25}
        />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap
          position="top-right"
          pannable
          zoomable
          nodeColor={(n) => (n.data?.isSelected ? '#14b8a6' : isDark ? '#3f3f46' : '#a1a1aa')}
          maskColor={isDark ? 'rgba(11, 12, 14, 0.7)' : 'rgba(244, 245, 246, 0.7)'}
        />
      </ReactFlow>

      {/* Top-Left Reset Action */}
      <button
        type="button"
        onClick={handleResetView}
        className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/90 dark:bg-[#13151A]/90 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-teal-500/60 transition-colors cursor-pointer backdrop-blur"
      >
        <RotateCcw className="w-3 h-3" />
        <span>Fit View</span>
      </button>

      {/* Bottom-Left Compact Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-3 px-3 py-1.5 rounded-lg bg-white/90 dark:bg-[#13151A]/90 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400 backdrop-blur">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-teal-500 inline-block" />
          <span>Active Relation</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 border-b-2 border-dashed border-amber-500 inline-block" />
          <span>Historical</span>
        </span>
      </div>
    </div>
  );
}

export function KnowledgeGraphPage() {
  const { theme } = useAuth();
  const isDark = theme === 'dark';

  const [nodesRaw, setNodesRaw] = useState<ApiNode[]>([]);
  const [edgesRaw, setEdgesRaw] = useState<ApiEdge[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'current' | 'historical'>('all');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('flow');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ nodes: ApiNode[]; edges: ApiEdge[] }>('/knowledge-graph')
      .then((res) => {
        setNodesRaw(res.nodes);
        setEdgesRaw(res.edges);
      })
      .finally(() => setLoading(false));
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const visibleEdges = useMemo(() => {
    return edgesRaw.filter((e) => {
      if (filterMode === 'current' && e.is_historical) return false;
      if (filterMode === 'historical' && !e.is_historical) return false;
      if (!normalizedQuery) return true;
      const srcLabel = nodesRaw.find((n) => n.id === e.source_entity_id)?.label.toLowerCase() ?? '';
      const tgtLabel = nodesRaw.find((n) => n.id === e.target_entity_id)?.label.toLowerCase() ?? '';
      return (
        e.predicate.toLowerCase().includes(normalizedQuery) ||
        (e.normalized_claim?.toLowerCase().includes(normalizedQuery) ?? false) ||
        srcLabel.includes(normalizedQuery) ||
        tgtLabel.includes(normalizedQuery)
      );
    });
  }, [edgesRaw, filterMode, normalizedQuery, nodesRaw]);

  const visibleNodes = useMemo(() => {
    const activeEntityIds = new Set<string>();
    visibleEdges.forEach((e) => {
      activeEntityIds.add(e.source_entity_id);
      activeEntityIds.add(e.target_entity_id);
    });
    return nodesRaw.filter((n) => {
      if (normalizedQuery) {
        return (
          activeEntityIds.has(n.id) ||
          n.label.toLowerCase().includes(normalizedQuery) ||
          n.entity_type.toLowerCase().includes(normalizedQuery) ||
          n.domain.toLowerCase().includes(normalizedQuery)
        );
      }
      return visibleEdges.length === 0 || activeEntityIds.has(n.id);
    });
  }, [nodesRaw, visibleEdges, normalizedQuery]);

  const connectedNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (selectedNodeId) {
      set.add(selectedNodeId);
      visibleEdges.forEach((e) => {
        if (e.source_entity_id === selectedNodeId) set.add(e.target_entity_id);
        if (e.target_entity_id === selectedNodeId) set.add(e.source_entity_id);
      });
    } else if (selectedEdgeId) {
      const edge = visibleEdges.find((e) => e.id === selectedEdgeId);
      if (edge) {
        set.add(edge.source_entity_id);
        set.add(edge.target_entity_id);
      }
    }
    return set;
  }, [selectedNodeId, selectedEdgeId, visibleEdges]);

  const flowNodes: Node<EntityNodeData>[] = useMemo(() => {
    const positions = computeNodePositions(visibleNodes, visibleEdges, layoutMode);
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);

    return visibleNodes.map((n) => {
      const nodeEdges = visibleEdges.filter(
        (e) => e.source_entity_id === n.id || e.target_entity_id === n.id,
      );
      const hasHistorical = nodeEdges.some((e) => Boolean(e.is_historical));
      const hasActive = nodeEdges.some((e) => !e.is_historical);
      const isSelected = n.id === selectedNodeId;
      const isDimmed = hasSelection && !connectedNodeIds.has(n.id);

      return {
        id: n.id,
        type: 'entity',
        position: positions.get(n.id) ?? { x: 60, y: 60 },
        data: {
          label: n.label,
          entityType: n.entity_type,
          domain: n.domain,
          degree: nodeEdges.length,
          hasHistorical,
          hasActive,
          isSelected,
          isDimmed,
        },
      };
    });
  }, [visibleNodes, visibleEdges, layoutMode, selectedNodeId, selectedEdgeId, connectedNodeIds]);

  const flowEdges: Edge[] = useMemo(() => {
    const hasSelection = Boolean(selectedNodeId || selectedEdgeId);

    return visibleEdges.map((e) => {
      const isEdgeHighlighted =
        e.id === selectedEdgeId ||
        (selectedNodeId !== null &&
          (e.source_entity_id === selectedNodeId || e.target_entity_id === selectedNodeId));
      const isDimmed = hasSelection && !isEdgeHighlighted;
      const strokeColor = e.is_historical ? '#f59e0b' : '#14b8a6';

      return {
        id: e.id,
        source: e.source_entity_id,
        target: e.target_entity_id,
        type: 'smoothstep',
        label: e.is_historical ? `${e.predicate} (Historical)` : e.predicate,
        animated: !e.is_historical && (!hasSelection || isEdgeHighlighted),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 16,
          height: 16,
        },
        style: {
          stroke: strokeColor,
          strokeDasharray: e.is_historical ? '6 4' : undefined,
          strokeWidth: isEdgeHighlighted ? 2.5 : 1.6,
          opacity: isDimmed ? 0.18 : 1,
        },
        labelStyle: {
          fill: isDark ? '#e4e4e7' : '#27272a',
          fontSize: 10.5,
          fontWeight: 500,
          opacity: isDimmed ? 0.2 : 1,
        },
        labelBgStyle: {
          fill: isDark ? '#13151A' : '#ffffff',
          fillOpacity: 0.92,
          stroke: isDark ? '#27272a' : '#e4e4e7',
          strokeWidth: 1,
        },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
      };
    });
  }, [visibleEdges, selectedNodeId, selectedEdgeId, isDark]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodesRaw.find((n) => n.id === selectedNodeId) ?? null : null),
    [nodesRaw, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => (selectedEdgeId ? edgesRaw.find((e) => e.id === selectedEdgeId) ?? null : null),
    [edgesRaw, selectedEdgeId],
  );

  const entityName = useCallback(
    (id: string) => nodesRaw.find((n) => n.id === id)?.label ?? id,
    [nodesRaw],
  );

  return (
    <AppShell
      title="Temporal Knowledge Graph"
      subtitle="Explore entities, valid-from / valid-until relationship timelines, and historical fact transitions"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Fact State Filter */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-white dark:bg-[#13151A] border border-zinc-200 dark:border-zinc-800">
              {[
                { id: 'all', label: 'All Facts' },
                { id: 'current', label: 'Current Active' },
                { id: 'historical', label: 'Historical Only' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setFilterMode(tab.id as typeof filterMode);
                    setSelectedNodeId(null);
                    setSelectedEdgeId(null);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                    filterMode === tab.id
                      ? 'bg-teal-600 text-white'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Layout Mode Switcher */}
            <div
              className="flex items-center gap-1 p-1 rounded-lg bg-white dark:bg-[#13151A] border border-zinc-200 dark:border-zinc-800"
              role="group"
              aria-label="Graph layout mode"
            >
              {[
                { id: 'flow', label: 'Flow', icon: Layers },
                { id: 'orbit', label: 'Orbit', icon: Orbit },
                { id: 'grid', label: 'Grid', icon: Grid3X3 },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLayoutMode(item.id as LayoutMode)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                      layoutMode === item.id
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-60">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter entities or predicates..."
                aria-label="Filter knowledge graph"
                className="w-full pl-8 pr-8 py-1.5 rounded-lg text-xs bg-white dark:bg-[#13151A] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear graph filter"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="text-xs text-zinc-500 font-mono tabular-nums">
              {flowNodes.length} entities · {flowEdges.length} relations
            </div>
          </div>
        </div>

        {loading ? (
          <div className="h-[580px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] animate-pulse" />
        ) : flowNodes.length === 0 ? (
          <div className="p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-3">
            <div className="font-display text-base font-semibold">
              {normalizedQuery ? 'No matching graph entities' : 'Knowledge graph is empty'}
            </div>
            <p className="text-sm text-zinc-500">
              {normalizedQuery
                ? `No entities or relationships match "${searchQuery.trim()}".`
                : 'Verify claims to automatically construct temporal entity relationships.'}
            </p>
            {normalizedQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
              >
                Clear filter
              </button>
            ) : (
              <Link to="/studio" className="inline-block text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline">
                Verify Claims
              </Link>
            )}
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8">
              <ReactFlowProvider>
                <GraphCanvasInner
                  flowNodes={flowNodes}
                  flowEdges={flowEdges}
                  isDark={isDark}
                  onSelectNode={(nodeId) => {
                    setSelectedNodeId(nodeId);
                    setSelectedEdgeId(null);
                  }}
                  onSelectEdge={(edgeId) => {
                    setSelectedEdgeId(edgeId);
                    setSelectedNodeId(null);
                  }}
                  onClearSelection={() => {
                    setSelectedNodeId(null);
                    setSelectedEdgeId(null);
                  }}
                />
              </ReactFlowProvider>
            </div>

            <div className="lg:col-span-4 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <h2 className="font-display text-sm font-semibold">Temporal Inspector</h2>
                </div>
                {(selectedNode || selectedEdge) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNodeId(null);
                      setSelectedEdgeId(null);
                    }}
                    className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {!selectedNode && !selectedEdge && (
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Click any entity card or relationship edge to spotlight its local subgraph and inspect validity windows, confidence, freshness, and Evidence DNA.
                </p>
              )}

              {selectedNode && (
                <div className="space-y-4 text-xs">
                  <div className="space-y-1">
                    <div className="text-zinc-500">Entity Name</div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-white">{selectedNode.label}</div>
                    <div className="text-[11px] text-zinc-500">
                      {selectedNode.entity_type} · {selectedNode.domain}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[380px] overflow-y-auto pr-1">
                    <div className="pb-2 font-medium text-zinc-500">Connected Temporal Facts</div>
                    {edgesRaw
                      .filter(
                        (e) =>
                          e.source_entity_id === selectedNode.id ||
                          e.target_entity_id === selectedNode.id,
                      )
                      .map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => {
                            setSelectedEdgeId(e.id);
                            setSelectedNodeId(null);
                          }}
                          className="w-full text-left py-2.5 space-y-1 hover:bg-zinc-50 dark:hover:bg-white/[0.03] rounded px-1.5 -mx-1.5 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              {e.normalized_claim || e.predicate}
                            </span>
                            <span
                              className={`text-[10px] font-mono shrink-0 ${
                                e.is_historical ? 'text-amber-500' : 'text-teal-500'
                              }`}
                            >
                              {e.is_historical ? 'Historical' : 'Active'}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500 flex items-center gap-1 flex-wrap">
                            <span>{entityName(e.source_entity_id)}</span>
                            <ArrowRight className="w-3 h-3 shrink-0" />
                            <span>{entityName(e.target_entity_id)}</span>
                          </div>
                          <div className="text-zinc-500 font-mono text-[10px]">
                            From {new Date(e.valid_from).toLocaleDateString()} ·{' '}
                            {e.valid_until ? `Until ${new Date(e.valid_until).toLocaleDateString()}` : 'Active'}
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {selectedEdge && (
                <div className="space-y-4 text-xs">
                  <div className="space-y-1">
                    <div className="text-zinc-500">Relationship</div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                      <span>{entityName(selectedEdge.source_entity_id)}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                      <span className="text-teal-600 dark:text-teal-400">{selectedEdge.predicate}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                      <span>{entityName(selectedEdge.target_entity_id)}</span>
                    </div>
                  </div>

                  {selectedEdge.normalized_claim && (
                    <div className="p-3 rounded-lg bg-zinc-50 dark:bg-[#0B0C0E] border border-zinc-200/80 dark:border-zinc-800/80">
                      <div className="text-[11px] text-zinc-500 mb-1">Underlying Claim</div>
                      <div className="leading-relaxed text-zinc-800 dark:text-zinc-200">
                        {selectedEdge.normalized_claim}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 font-mono tabular-nums">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500 font-sans">Confidence</span>
                        <span>{selectedEdge.confidence}/100</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, selectedEdge.confidence))}%` }}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500 font-sans">Freshness</span>
                        <span>{selectedEdge.freshness}/100</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, selectedEdge.freshness))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="font-mono text-[11px] text-zinc-500 space-y-1 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <div>Valid From: {new Date(selectedEdge.valid_from).toLocaleString()}</div>
                    <div>
                      Valid Until:{' '}
                      {selectedEdge.valid_until
                        ? new Date(selectedEdge.valid_until).toLocaleString()
                        : 'Present (Active)'}
                    </div>
                  </div>

                  {selectedEdge.claim_id && (
                    <Link
                      to={`/claims/${selectedEdge.claim_id}`}
                      className="inline-flex items-center gap-1.5 text-teal-700 dark:text-teal-400 font-medium hover:underline"
                    >
                      <span>Inspect Claim & Evidence DNA</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
