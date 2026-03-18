import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Loader2, Table2, Key } from 'lucide-react';
import toast from 'react-hot-toast';

const NODE_WIDTH = 220;
const NODE_MIN_HEIGHT = 80;
const ROW_HEIGHT = 20;

// Auto-layout using dagre
function getLayoutedElements(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120, marginx: 40, marginy: 40 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: node.data.height || NODE_MIN_HEIGHT });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return { ...node, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - (node.data.height || NODE_MIN_HEIGHT) / 2 } };
  });

  return { nodes: layoutedNodes, edges };
}

// Custom table node
function TableNode({ data }) {
  const { label, columns, highlighted } = data;
  return (
    <div className={`border ${highlighted ? 'border-accent-green shadow-[0_0_12px_rgba(0,255,136,0.3)]' : 'border-border'} bg-bg-card min-w-[200px]`}>
      {/* Table header */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${highlighted ? 'border-accent-green/30 bg-accent-green/10' : 'border-border bg-bg-alt'}`}>
        <Table2 size={12} className={highlighted ? 'text-accent-green' : 'text-accent-blue'} />
        <span className="font-['JetBrains_Mono'] text-[11px] font-bold text-white">{label}</span>
        <span className="font-['JetBrains_Mono'] text-[9px] text-text-dark ml-auto">{columns.length}</span>
      </div>
      {/* Columns */}
      <div className="py-1">
        {columns.map((col, i) => (
          <div key={i} className="flex items-center gap-1.5 px-3 py-0.5 hover:bg-white/[0.02]">
            {col.key === 'PRI' ? (
              <Key size={8} className="text-accent-yellow shrink-0" />
            ) : col.key === 'MUL' ? (
              <Key size={8} className="text-accent-blue shrink-0" />
            ) : (
              <span className="w-2 shrink-0" />
            )}
            <span className="font-['JetBrains_Mono'] text-[10px] text-text-light truncate">{col.name}</span>
            <span className="font-['JetBrains_Mono'] text-[9px] text-text-dark ml-auto shrink-0">{col.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = { table: TableNode };

export default function SchemaMap({ serverId, engine, databases, selectedDb: initialDb }) {
  const [selectedDb, setSelectedDb] = useState(initialDb || '');
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hoveredTable, setHoveredTable] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Load schema when database changes
  useEffect(() => {
    if (!serverId || !engine || !selectedDb) return;
    setLoading(true);
    setSchema(null);
    api.getDbSchema(serverId, engine, selectedDb)
      .then(data => {
        setSchema(data);
        buildGraph(data);
      })
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [serverId, engine, selectedDb]);

  const buildGraph = useCallback((data) => {
    if (!data) return;

    const { tables, foreignKeys } = data;

    // Find all tables involved in FK relationships
    const fkTables = new Set();
    foreignKeys.forEach(fk => { fkTables.add(fk.table); fkTables.add(fk.refTable); });

    // Build nodes
    const rawNodes = tables.map((table) => {
      const colCount = Math.max(table.columns.length, 1);
      const height = 36 + colCount * ROW_HEIGHT + 8;
      return {
        id: table.name,
        type: 'table',
        position: { x: 0, y: 0 },
        data: {
          label: table.name,
          columns: table.columns,
          height,
          highlighted: false,
        },
      };
    });

    // Build edges from foreign keys
    const rawEdges = foreignKeys.map((fk, i) => ({
      id: `fk-${i}`,
      source: fk.table,
      target: fk.refTable,
      sourceHandle: null,
      targetHandle: null,
      label: `${fk.column} → ${fk.refColumn}`,
      labelStyle: { fontSize: 9, fontFamily: 'JetBrains Mono', fill: '#8a8a8a' },
      labelBgStyle: { fill: '#0A0A0A', fillOpacity: 0.9 },
      labelBgPadding: [4, 2],
      style: { stroke: '#00FF88', strokeWidth: 1.5 },
      animated: true,
      type: 'smoothstep',
    }));

    const { nodes: layouted, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges);
    setNodes(layouted);
    setEdges(layoutedEdges);
  }, []);

  // Highlight connected tables on hover
  const onNodeMouseEnter = useCallback((_, node) => {
    setHoveredTable(node.id);
    const connectedTables = new Set([node.id]);
    edges.forEach(e => {
      if (e.source === node.id) connectedTables.add(e.target);
      if (e.target === node.id) connectedTables.add(e.source);
    });

    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, highlighted: connectedTables.has(n.id) },
    })));

    setEdges(eds => eds.map(e => ({
      ...e,
      style: {
        ...e.style,
        stroke: (e.source === node.id || e.target === node.id) ? '#00FF88' : '#2f2f2f',
        strokeWidth: (e.source === node.id || e.target === node.id) ? 2 : 1,
      },
      animated: e.source === node.id || e.target === node.id,
    })));
  }, [edges]);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredTable(null);
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, highlighted: false },
    })));
    setEdges(eds => eds.map(e => ({
      ...e,
      style: { ...e.style, stroke: '#00FF88', strokeWidth: 1.5 },
      animated: true,
    })));
  }, []);

  const stats = useMemo(() => {
    if (!schema) return null;
    return {
      tables: schema.tables.length,
      relationships: schema.foreignKeys.length,
      columns: schema.tables.reduce((sum, t) => sum + t.columns.length, 0),
    };
  }, [schema]);

  return (
    <div className="flex flex-col h-full">
      {/* Schema map header */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-bg-alt shrink-0">
        <select
          value={selectedDb}
          onChange={e => setSelectedDb(e.target.value)}
          className="bg-bg-input border border-border text-text-light font-['JetBrains_Mono'] text-xs px-3 py-1.5 outline-none"
        >
          <option value="">Select database...</option>
          {databases.map(db => (
            <option key={db} value={db}>{db}</option>
          ))}
        </select>

        {stats && (
          <div className="flex items-center gap-3">
            <span className="font-['JetBrains_Mono'] text-[10px] text-accent-blue bg-accent-blue/10 px-2 py-0.5 border border-accent-blue/20">
              {stats.tables} tables
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-accent-green bg-accent-green/10 px-2 py-0.5 border border-accent-green/20">
              {stats.relationships} relationships
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-accent-yellow bg-accent-yellow/10 px-2 py-0.5 border border-accent-yellow/20">
              {stats.columns} columns
            </span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="font-['JetBrains_Mono'] text-[9px] text-text-dark">
            <Key size={8} className="inline text-accent-yellow" /> PK
            <span className="mx-2">|</span>
            <Key size={8} className="inline text-accent-blue" /> FK
            <span className="mx-2">|</span>
            <span className="text-accent-green">—</span> relationship
          </span>
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="text-accent-green animate-spin" />
            <span className="font-['JetBrains_Mono'] text-xs text-text-dim ml-3">Loading schema...</span>
          </div>
        ) : !selectedDb ? (
          <div className="flex items-center justify-center h-full text-text-dim">
            <span className="font-['JetBrains_Mono'] text-xs">Select a database to view schema map</span>
          </div>
        ) : nodes.length === 0 && !loading ? (
          <div className="flex items-center justify-center h-full text-text-dim">
            <span className="font-['JetBrains_Mono'] text-xs">No tables found</span>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            style={{ background: '#050505' }}
          >
            <Background color="#1a1a1a" gap={20} size={1} />
            <Controls
              showInteractive={false}
              style={{ background: '#141414', border: '1px solid #2f2f2f', borderRadius: 0 }}
            />
            <MiniMap
              style={{ background: '#0A0A0A', border: '1px solid #2f2f2f', borderRadius: 0 }}
              nodeColor="#1a1a1a"
              maskColor="rgba(0,0,0,0.7)"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
