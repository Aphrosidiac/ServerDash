import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { getSocket } from '../socket';
import StatusBadge from '../components/StatusBadge';
import toast from 'react-hot-toast';
import {
  ArrowLeft, RefreshCw, Cpu, MemoryStick, HardDrive, Network,
  Folder, File, ArrowUp, FolderGit2, ChevronRight, TerminalSquare,
  ChevronUp, ChevronDown, Send, X, Save, Loader2, GripHorizontal
} from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function UsageBar({ used, total, color = 'bg-accent-green' }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between mb-1">
        <span className="font-['JetBrains_Mono'] text-[10px] text-text-muted">{formatBytes(used)} / {formatBytes(total)}</span>
        <span className="font-['JetBrains_Mono'] text-[10px] text-text-muted">{pct}%</span>
      </div>
      <div className="h-1.5 bg-border w-full">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ServerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [server, setServer] = useState(null);
  const [stats, setStats] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [files, setFiles] = useState({ path: '/home', files: [] });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filePath, setFilePath] = useState('/home');

  // Terminal state
  const [termOpen, setTermOpen] = useState(true);
  const [cmd, setCmd] = useState('');
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [termLines, setTermLines] = useState([{ type: 'info', text: '> Terminal ready. Commands execute in the current file browser directory.' }]);
  const [executing, setExecuting] = useState(false);
  const [termHeight, setTermHeight] = useState(240);
  const termBottomRef = useRef(null);
  const inputRef = useRef(null);
  const isDragging = useRef(false);

  // File editor state
  const [editingFile, setEditingFile] = useState(null); // { path, content, originalContent }
  const [fileLoading, setFileLoading] = useState(false);
  const [fileSaving, setFileSaving] = useState(false);
  const editorRef = useRef(null);

  const openFile = async (fileName) => {
    const fullPath = filePath === '/' ? `/${fileName}` : `${filePath}/${fileName}`;
    setFileLoading(true);
    try {
      const data = await api.getFileContent(id, fullPath);
      setEditingFile({ path: data.path, content: data.content, originalContent: data.content });
    } catch (err) {
      toast.error(err.message);
    }
    setFileLoading(false);
  };

  const saveFile = async () => {
    if (!editingFile) return;
    setFileSaving(true);
    try {
      await api.saveFileContent(id, editingFile.path, editingFile.content);
      toast.success('File saved');
      setEditingFile(prev => ({ ...prev, originalContent: prev.content }));
    } catch (err) {
      toast.error(err.message);
    }
    setFileSaving(false);
  };

  const closeEditor = () => {
    if (editingFile && editingFile.content !== editingFile.originalContent) {
      if (!confirm('You have unsaved changes. Close anyway?')) return;
    }
    setEditingFile(null);
  };

  useEffect(() => {
    termBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [termLines]);

  // Terminal resize drag
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    const startY = e.clientY;
    const startHeight = termHeight;

    const onMove = (ev) => {
      if (!isDragging.current) return;
      const delta = startY - ev.clientY;
      setTermHeight(Math.max(120, Math.min(window.innerHeight * 0.8, startHeight + delta)));
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [termHeight]);

  const loadAll = useCallback(async () => {
    try {
      const [srv, st, proc, fl, proj] = await Promise.all([
        api.getServer(id),
        api.getServerStats(id),
        api.getServerProcesses(id),
        api.getServerFiles(id, filePath),
        api.getServerProjects(id),
      ]);
      setServer(srv);
      setStats(st);
      setProcesses(proc);
      setFiles(fl);
      setProjects(proj);
    } catch (err) {
      toast.error(err.message);
    }
    setLoading(false);
  }, [id, filePath]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const refresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const navigateDir = async (dirName) => {
    let newPath;
    if (dirName === '..') {
      newPath = filePath.split('/').slice(0, -1).join('/') || '/';
    } else {
      newPath = filePath === '/' ? `/${dirName}` : `${filePath}/${dirName}`;
    }
    setFilePath(newPath);
    try {
      const fl = await api.getServerFiles(id, newPath);
      setFiles(fl);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const execTermCmd = async (e) => {
    e.preventDefault();
    const trimmed = cmd.trim();
    if (!trimmed || executing) return;

    setExecuting(true);
    setCmdHistory(prev => [trimmed, ...prev]);
    setHistoryIdx(-1);
    setTermLines(prev => [...prev, { type: 'cmd', text: `${filePath} $ ${trimmed}` }]);
    setCmd('');

    // Handle cd locally
    if (trimmed.startsWith('cd ')) {
      const target = trimmed.slice(3).trim();
      let newPath;
      if (target === '..') {
        newPath = filePath.split('/').slice(0, -1).join('/') || '/';
      } else if (target.startsWith('/')) {
        newPath = target;
      } else {
        newPath = filePath === '/' ? `/${target}` : `${filePath}/${target}`;
      }
      setFilePath(newPath);
      try {
        const fl = await api.getServerFiles(id, newPath);
        setFiles(fl);
        setTermLines(prev => [...prev, { type: 'info', text: `> Changed directory to ${newPath}` }]);
      } catch (err) {
        setTermLines(prev => [...prev, { type: 'error', text: err.message }]);
      }
      setExecuting(false);
      return;
    }

    const socket = getSocket();
    if (!socket?.connected) {
      // Fallback to HTTP if socket not connected
      try {
        const fullCmd = `cd "${filePath}" && ${trimmed}`;
        const result = await api.execServerCommand(id, fullCmd);
        if (result.stdout) setTermLines(prev => [...prev, { type: 'stdout', text: result.stdout }]);
        if (result.stderr) setTermLines(prev => [...prev, { type: 'stderr', text: result.stderr }]);
        if (result.code !== 0 && result.code !== null) {
          setTermLines(prev => [...prev, { type: 'error', text: `exit code: ${result.code}` }]);
        }
      } catch (err) {
        setTermLines(prev => [...prev, { type: 'error', text: err.message }]);
      }
      setExecuting(false);
      return;
    }

    const fullCmd = `cd "${filePath}" && ${trimmed}`;

    const onOutput = ({ type, data }) => {
      setTermLines(prev => [...prev, { type, text: data }]);
    };
    const onDone = async ({ code }) => {
      socket.off('terminal:output', onOutput);
      socket.off('terminal:done', onDone);
      if (code !== 0 && code !== null) {
        setTermLines(prev => [...prev, { type: 'error', text: `exit code: ${code}` }]);
      }
      // Refresh file list if command might have changed files
      if (/^(rm|mv|cp|mkdir|touch|chmod|chown|git|npm|yarn|pip)/.test(trimmed)) {
        try {
          const fl = await api.getServerFiles(id, filePath);
          setFiles(fl);
        } catch {}
      }
      setExecuting(false);
    };

    socket.on('terminal:output', onOutput);
    socket.on('terminal:done', onDone);
    socket.emit('terminal:exec', { serverId: id, command: fullCmd });
  };

  const handleTermKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const newIdx = Math.min(historyIdx + 1, cmdHistory.length - 1);
        setHistoryIdx(newIdx);
        setCmd(cmdHistory[newIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const newIdx = historyIdx - 1;
        setHistoryIdx(newIdx);
        setCmd(cmdHistory[newIdx]);
      } else {
        setHistoryIdx(-1);
        setCmd('');
      }
    }
  };

  if (loading) return <div className="p-8 text-text-dim font-['JetBrains_Mono'] text-xs">connecting<span className="animate-pulse">_</span></div>;

  const termColorMap = {
    cmd: 'text-white',
    info: 'text-accent-blue',
    stdout: 'text-accent-green/80',
    stderr: 'text-accent-yellow',
    error: 'text-accent-red',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-8 bg-bg-sidebar border-b border-border shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/servers')} className="text-text-dim hover:text-text-light transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-3">
            <span className="font-['Space_Grotesk'] text-lg font-bold text-white tracking-[-0.5px]">{server?.name}</span>
            <span className="font-['JetBrains_Mono'] text-[11px] text-text-dim">{server?.username}@{server?.host}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTermOpen(!termOpen)}
            className="flex items-center gap-1.5 bg-bg-input border border-border text-text-muted font-['JetBrains_Mono'] text-[10px] font-medium tracking-[0.5px] uppercase px-3 py-2 hover:text-accent-green hover:border-accent-green/30 transition-colors">
            <TerminalSquare size={12} /> Terminal {termOpen ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
          </button>
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-1.5 bg-bg-input border border-border text-text-muted font-['JetBrains_Mono'] text-[10px] font-medium tracking-[0.5px] uppercase px-3 py-2 hover:text-accent-green hover:border-accent-green/30 transition-colors disabled:opacity-40">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-8 space-y-6">
        {/* System Info Bar */}
        {stats && (
          <div className="bg-bg-card border border-border px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-2">
            {[
              { label: 'Hostname', value: stats.hostname },
              { label: 'OS', value: stats.os },
              { label: 'Kernel', value: stats.kernel, mono: true },
              { label: 'Uptime', value: stats.uptime },
              { label: 'Load', value: stats.load, mono: true },
            ].map(({ label, value, mono }, i) => (
              <div key={label} className="flex items-center gap-4">
                {i > 0 && <div className="w-px h-8 bg-border -ml-4" />}
                <div>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-[1px] uppercase">{label}</span>
                  <p className={`${mono ? "font-['JetBrains_Mono'] text-xs" : "font-['Inter'] text-sm font-medium"} text-text-light`}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Health Metrics */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-bg-card border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase">CPU</span>
                <Cpu size={16} className="text-accent-blue" />
              </div>
              <span className="font-['Space_Grotesk'] text-3xl font-bold text-white">{stats.cpu.usage}<span className="text-lg text-text-muted">%</span></span>
              <p className="font-['JetBrains_Mono'] text-[10px] text-text-dim mt-1">{stats.cpu.cores} cores</p>
            </div>
            <div className="bg-bg-card border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase">Memory</span>
                <MemoryStick size={16} className="text-accent-green" />
              </div>
              <UsageBar used={stats.memory.used} total={stats.memory.total} color="bg-accent-green" />
              {stats.swap.total > 0 && (
                <div className="mt-3">
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-[1px]">SWAP</span>
                  <UsageBar used={stats.swap.used} total={stats.swap.total} color="bg-accent-yellow" />
                </div>
              )}
            </div>
            <div className="bg-bg-card border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase">Disk</span>
                <HardDrive size={16} className="text-accent-orange" />
              </div>
              <UsageBar used={stats.disk.used} total={stats.disk.total} color={stats.disk.total > 0 && (stats.disk.used / stats.disk.total) > 0.85 ? 'bg-accent-red' : 'bg-accent-orange'} />
            </div>
            <div className="bg-bg-card border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase">Network</span>
                <Network size={16} className="text-accent-blue" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim">RX</span>
                  <span className="font-['JetBrains_Mono'] text-xs text-accent-green">{formatBytes(stats.network.rx)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim">TX</span>
                  <span className="font-['JetBrains_Mono'] text-xs text-accent-blue">{formatBytes(stats.network.tx)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Two column: Processes + Projects */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-bg-card border border-border overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg-alt">
              <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px]">// TOP_PROCESSES</span>
              <span className="font-['JetBrains_Mono'] text-[10px] text-accent-green bg-accent-green/10 px-2 py-0.5 border border-accent-green/20">{processes.length}</span>
            </div>
            <div className="overflow-auto max-h-72">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {['PID', 'User', 'CPU%', 'MEM%', 'Command'].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-['JetBrains_Mono'] text-[10px] font-semibold text-text-dim tracking-[1.5px] uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {processes.map((p, i) => (
                    <tr key={i} className={`border-b border-border/50 ${i % 2 === 0 ? 'bg-bg-card' : 'bg-bg-alt'}`}>
                      <td className="px-4 py-1.5 font-['JetBrains_Mono'] text-[11px] text-text-muted">{p.pid}</td>
                      <td className="px-4 py-1.5 font-['JetBrains_Mono'] text-[11px] text-text-muted">{p.user}</td>
                      <td className="px-4 py-1.5 font-['JetBrains_Mono'] text-[11px] text-text-light">{p.cpu}</td>
                      <td className="px-4 py-1.5 font-['JetBrains_Mono'] text-[11px] text-text-light">{p.mem}</td>
                      <td className="px-4 py-1.5 font-['JetBrains_Mono'] text-[11px] text-text-dim truncate max-w-xs">{p.command}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-bg-card border border-border overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg-alt">
              <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px]">// LINKED_PROJECTS</span>
              <span className="font-['JetBrains_Mono'] text-[10px] text-accent-green bg-accent-green/10 px-2 py-0.5 border border-accent-green/20">{projects.length}</span>
            </div>
            {projects.length === 0 ? (
              <div className="p-6 text-center"><p className="font-['JetBrains_Mono'] text-xs text-text-dim">no_projects_linked</p></div>
            ) : (
              <div>
                {projects.map((project, i) => (
                  <div key={project.id} className={`flex items-center justify-between px-4 py-3 border-b border-border/50 ${i % 2 === 0 ? '' : 'bg-bg-alt'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <FolderGit2 size={14} className="text-accent-green shrink-0" />
                      <div className="min-w-0">
                        <Link to={`/projects/${project.id}`} className="font-['Inter'] text-sm font-medium text-text-light hover:text-accent-green transition-colors truncate block">{project.name}</Link>
                        <p className="font-['JetBrains_Mono'] text-[10px] text-text-dim truncate">{project.path}</p>
                      </div>
                    </div>
                    <StatusBadge status={project.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* File Browser */}
        <div className="bg-bg-card border border-border overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg-alt">
            <div className="flex items-center gap-2">
              <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px]">// FILE_BROWSER</span>
              <div className="flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] text-text-dim ml-3">
                <button onClick={() => { setFilePath('/'); api.getServerFiles(id, '/').then(setFiles); }} className="hover:text-accent-green transition-colors">/</button>
                {files.path.split('/').filter(Boolean).map((seg, i, arr) => (
                  <span key={i} className="flex items-center gap-1">
                    <ChevronRight size={10} className="text-text-dim" />
                    <button
                      onClick={() => {
                        const newPath = '/' + arr.slice(0, i + 1).join('/');
                        setFilePath(newPath);
                        api.getServerFiles(id, newPath).then(setFiles).catch(e => toast.error(e.message));
                      }}
                      className="hover:text-accent-green transition-colors"
                    >{seg}</button>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="overflow-auto max-h-80">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {['Name', 'Size', 'Owner', 'Permissions', 'Modified'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-['JetBrains_Mono'] text-[10px] font-semibold text-text-dim tracking-[1.5px] uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filePath !== '/' && (
                  <tr className="border-b border-border/50 bg-bg-card hover:bg-white/[0.02] cursor-pointer" onClick={() => navigateDir('..')}>
                    <td className="px-4 py-2 font-['JetBrains_Mono'] text-xs text-accent-blue flex items-center gap-2"><ArrowUp size={12} /> ..</td>
                    <td colSpan={4} />
                  </tr>
                )}
                {files.files.map((file, i) => (
                  <tr key={file.name} className={`border-b border-border/50 ${i % 2 === 0 ? 'bg-bg-card' : 'bg-bg-alt'} cursor-pointer hover:bg-white/[0.02]`}
                    onClick={() => file.isDir ? navigateDir(file.name) : openFile(file.name)}>
                    <td className="px-4 py-2 font-['JetBrains_Mono'] text-xs flex items-center gap-2">
                      {file.isDir ? <Folder size={12} className="text-accent-blue shrink-0" /> : <File size={12} className="text-text-dim shrink-0" />}
                      <span className={file.isDir ? 'text-accent-blue' : 'text-text-light hover:text-accent-green transition-colors'}>{file.name}</span>
                    </td>
                    <td className="px-4 py-2 font-['JetBrains_Mono'] text-[11px] text-text-dim">{file.isDir ? '-' : formatBytes(file.size)}</td>
                    <td className="px-4 py-2 font-['JetBrains_Mono'] text-[11px] text-text-dim">{file.owner}</td>
                    <td className="px-4 py-2 font-['JetBrains_Mono'] text-[11px] text-text-dim">{file.permissions}</td>
                    <td className="px-4 py-2 font-['JetBrains_Mono'] text-[11px] text-text-dim">{file.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Terminal Panel - sticky bottom */}
      {termOpen && (
        <div className="shrink-0 border-t border-border bg-bg-sidebar flex flex-col" style={{ height: `${termHeight}px` }}>
          {/* Drag handle */}
          <div
            onMouseDown={handleResizeStart}
            className="h-1.5 cursor-row-resize flex items-center justify-center hover:bg-accent-green/10 transition-colors group shrink-0"
          >
            <GripHorizontal size={12} className="text-text-dim group-hover:text-accent-green transition-colors" />
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <TerminalSquare size={12} className="text-accent-green" />
              <span className="font-['JetBrains_Mono'] text-[10px] font-medium text-text-muted tracking-[0.5px]">
                TERMINAL
              </span>
              <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim">
                {filePath}
              </span>
            </div>
            <button onClick={() => setTermLines([{ type: 'info', text: '> Terminal cleared.' }])}
              className="font-['JetBrains_Mono'] text-[10px] text-text-dim hover:text-text-muted transition-colors uppercase tracking-[0.5px]">
              Clear
            </button>
          </div>

          {/* Terminal output */}
          <div className="flex-1 overflow-auto px-4 py-2 font-['JetBrains_Mono'] text-xs" onClick={() => inputRef.current?.focus()}>
            {termLines.map((line, i) => (
              <div key={i} className={`${termColorMap[line.type] || 'text-text-muted'} whitespace-pre-wrap leading-relaxed`}>
                {line.text}
              </div>
            ))}
            <div ref={termBottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={execTermCmd} className="flex items-center gap-2 px-4 py-2 border-t border-border">
            <span className="font-['JetBrains_Mono'] text-xs text-accent-green shrink-0">$</span>
            <input
              ref={inputRef}
              type="text"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={handleTermKeyDown}
              placeholder="enter command..."
              disabled={executing}
              className="flex-1 bg-transparent text-text-light font-['JetBrains_Mono'] text-xs focus:outline-none placeholder:text-text-dim disabled:opacity-50"
              autoFocus
            />
            <button type="submit" disabled={executing} className="text-text-dim hover:text-accent-green transition-colors disabled:opacity-40">
              <Send size={12} />
            </button>
          </form>
        </div>
      )}

      {/* File Loading Indicator */}
      {fileLoading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="flex items-center gap-3 bg-bg-card border border-border px-6 py-4">
            <Loader2 size={16} className="text-accent-green animate-spin" />
            <span className="font-['JetBrains_Mono'] text-xs text-text-muted">Loading file...</span>
          </div>
        </div>
      )}

      {/* File Editor Modal */}
      {editingFile && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-8">
          <div className="bg-bg-sidebar border border-border flex flex-col w-full max-w-4xl" style={{ height: '80vh' }}>
            {/* Editor Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <File size={14} className="text-accent-green shrink-0" />
                <span className="font-['JetBrains_Mono'] text-xs text-text-light truncate">{editingFile.path}</span>
                {editingFile.content !== editingFile.originalContent && (
                  <span className="font-['JetBrains_Mono'] text-[10px] text-accent-yellow bg-accent-yellow/10 px-1.5 py-0.5 border border-accent-yellow/20 shrink-0">MODIFIED</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={saveFile}
                  disabled={fileSaving || editingFile.content === editingFile.originalContent}
                  className="flex items-center gap-1.5 bg-accent-green/10 border border-accent-green/30 text-accent-green font-['JetBrains_Mono'] text-[10px] font-bold tracking-[1px] uppercase px-3 py-1.5 hover:bg-accent-green/15 hover:border-accent-green/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {fileSaving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                  {fileSaving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={closeEditor} className="text-text-dim hover:text-text-light transition-colors p-1">
                  <X size={16} />
                </button>
              </div>
            </div>
            {/* Editor Body */}
            <div className="flex-1 overflow-hidden">
              <textarea
                ref={editorRef}
                value={editingFile.content}
                onChange={(e) => setEditingFile(prev => ({ ...prev, content: e.target.value }))}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    saveFile();
                  }
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = e.target.selectionStart;
                    const end = e.target.selectionEnd;
                    const val = editingFile.content;
                    setEditingFile(prev => ({
                      ...prev,
                      content: val.substring(0, start) + '  ' + val.substring(end),
                    }));
                    setTimeout(() => {
                      e.target.selectionStart = e.target.selectionEnd = start + 2;
                    }, 0);
                  }
                }}
                spellCheck={false}
                className="w-full h-full bg-bg-card text-text-light font-['JetBrains_Mono'] text-xs leading-relaxed p-4 resize-none focus:outline-none border-none"
                style={{ tabSize: 2 }}
              />
            </div>
            {/* Editor Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-border text-text-dim font-['JetBrains_Mono'] text-[10px] shrink-0">
              <span>{editingFile.content.split('\n').length} lines</span>
              <span>Ctrl+S to save</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
