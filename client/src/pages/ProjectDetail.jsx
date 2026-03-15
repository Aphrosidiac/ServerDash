import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { getSocket } from '../socket';
import Terminal from '../components/Terminal';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { Rocket, RefreshCw, TerminalSquare, ArrowLeft, GitBranch, FolderOpen, ChevronDown, ChevronUp, Plus, Pencil, Trash2, Play } from 'lucide-react';

const COLORS = ['green', 'blue', 'yellow', 'orange', 'red'];
const colorMap = {
  green: { bg: 'bg-accent-green/8', border: 'border-accent-green/20', text: 'text-accent-green', hover: 'hover:bg-accent-green/15' },
  blue: { bg: 'bg-accent-blue/8', border: 'border-accent-blue/20', text: 'text-accent-blue', hover: 'hover:bg-accent-blue/15' },
  yellow: { bg: 'bg-accent-yellow/8', border: 'border-accent-yellow/20', text: 'text-accent-yellow', hover: 'hover:bg-accent-yellow/15' },
  orange: { bg: 'bg-accent-orange/8', border: 'border-accent-orange/20', text: 'text-accent-orange', hover: 'hover:bg-accent-orange/15' },
  red: { bg: 'bg-accent-red/8', border: 'border-accent-red/20', text: 'text-accent-red', hover: 'hover:bg-accent-red/15' },
};

const emptyCmdSetForm = { name: '', commands: '', color: 'green' };

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [logs, setLogs] = useState([]);
  const [termLines, setTermLines] = useState([]);
  const [deploying, setDeploying] = useState(false);
  const [runningSet, setRunningSet] = useState(null);
  const [cmd, setCmd] = useState('');
  const [cmdResult, setCmdResult] = useState(null);
  const [execLoading, setExecLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [commandSets, setCommandSets] = useState([]);
  const [showCmdSetModal, setShowCmdSetModal] = useState(false);
  const [editingCmdSet, setEditingCmdSet] = useState(null);
  const [cmdSetForm, setCmdSetForm] = useState(emptyCmdSetForm);

  const load = useCallback(() => {
    api.getProject(id).then(setProject);
    api.getProjectLogs(id).then(setLogs);
    api.getCommandSets(id).then(setCommandSets);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('join:project', parseInt(id));
    const handler = (data) => {
      setTermLines((prev) => [...prev, { type: data.type, data: data.data }]);
      if (data.type === 'info' && data.data.includes('completed successfully')) { setDeploying(false); setRunningSet(null); load(); }
      if (data.type === 'error' && (data.data.includes('error') || data.data.includes('failed'))) { setDeploying(false); setRunningSet(null); load(); }
    };
    socket.on('deploy:output', handler);
    return () => { socket.off('deploy:output', handler); socket.emit('leave:project', parseInt(id)); };
  }, [id, load]);

  const handleDeploy = async () => {
    setDeploying(true); setTermLines([]);
    try { await api.deployProject(id); } catch (err) { toast.error(err.message); setDeploying(false); }
  };

  const handleRunCommandSet = async (set) => {
    setRunningSet(set.id); setTermLines([]);
    try { await api.runCommandSet(set.id); } catch (err) { toast.error(err.message); setRunningSet(null); }
  };

  const handleExec = async (e) => {
    e.preventDefault();
    if (!cmd.trim()) return;
    setExecLoading(true); setCmdResult(null);
    try { setCmdResult(await api.execCommand(id, cmd)); } catch (err) { setCmdResult({ stderr: err.message, code: 1 }); }
    setExecLoading(false);
  };

  const handleCheckStatus = async () => {
    try {
      const result = await api.checkStatus(id);
      toast.success(`Status: ${result.status}${result.lastCommit ? ` | ${result.lastCommit}` : ''}`);
      load();
    } catch (err) { toast.error(err.message); }
  };

  // Command set CRUD
  const handleCmdSetSubmit = async (e) => {
    e.preventDefault();
    const commands = cmdSetForm.commands.split('\n').map(c => c.trim()).filter(Boolean);
    if (!commands.length) { toast.error('Add at least one command'); return; }
    try {
      if (editingCmdSet) {
        await api.updateCommandSet(editingCmdSet, { name: cmdSetForm.name, commands, color: cmdSetForm.color });
        toast.success('Command set updated');
      } else {
        await api.createCommandSet({ project_id: parseInt(id), name: cmdSetForm.name, commands, color: cmdSetForm.color });
        toast.success('Command set created');
      }
      setShowCmdSetModal(false); setEditingCmdSet(null); setCmdSetForm(emptyCmdSetForm); load();
    } catch (err) { toast.error(err.message); }
  };

  const openEditCmdSet = (set) => {
    setEditingCmdSet(set.id);
    setCmdSetForm({ name: set.name, commands: set.commands.join('\n'), color: set.color || 'green' });
    setShowCmdSetModal(true);
  };

  const handleDeleteCmdSet = async (setId) => {
    if (!confirm('Delete this command set?')) return;
    await api.deleteCommandSet(setId); toast.success('Deleted'); load();
  };

  if (!project) return <div className="p-8 text-text-dim font-['JetBrains_Mono'] text-xs">loading<span className="animate-pulse">_</span></div>;

  const busy = deploying || runningSet !== null;

  return (
    <div>
      {/* Header Bar */}
      <div className="flex items-center justify-between h-16 px-8 bg-bg-sidebar border-b border-border">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/projects')} className="text-text-dim hover:text-text-light transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-3">
            <span className="font-['Space_Grotesk'] text-lg font-bold text-white tracking-[-0.5px]">{project.name}</span>
            <StatusBadge status={project.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCheckStatus}
            className="flex items-center gap-1.5 bg-bg-input border border-border text-text-muted font-['JetBrains_Mono'] text-[10px] font-medium tracking-[0.5px] uppercase px-3 py-2 hover:text-text-light hover:border-text-muted/30 transition-colors">
            <RefreshCw size={12} /> Status
          </button>
          <button onClick={handleDeploy} disabled={busy}
            className="flex items-center gap-1.5 bg-accent-green/10 border border-accent-green/30 text-accent-green font-['JetBrains_Mono'] text-[10px] font-bold tracking-[1px] uppercase px-4 py-2 hover:bg-accent-green/15 hover:border-accent-green/50 transition-colors disabled:opacity-40">
            <Rocket size={12} /> {deploying ? 'Deploying...' : 'Deploy'}
          </button>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Project Info */}
        <div className="flex items-center gap-6 font-['JetBrains_Mono'] text-[11px] text-text-dim tracking-[0.5px]">
          <span className="flex items-center gap-1.5"><FolderOpen size={12} /> {project.path}</span>
          <span className="flex items-center gap-1.5"><GitBranch size={12} /> {project.branch}</span>
          <span>{project.server_name} ({project.server_host})</span>
        </div>

        {/* Command Sets — action buttons */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px]">// COMMANDS</span>
            <button onClick={() => { setEditingCmdSet(null); setCmdSetForm(emptyCmdSetForm); setShowCmdSetModal(true); }}
              className="flex items-center gap-1.5 text-text-dim hover:text-accent-green font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.5px] transition-colors">
              <Plus size={12} /> New Command Set
            </button>
          </div>
          {commandSets.length === 0 ? (
            <div className="bg-bg-card border border-border p-6 text-center">
              <p className="font-['JetBrains_Mono'] text-[11px] text-text-dim">
                {'>'} no_command_sets. Click "New Command Set" to create reusable command groups.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {commandSets.map(set => {
                const c = colorMap[set.color] || colorMap.green;
                const isRunning = runningSet === set.id;
                return (
                  <div key={set.id} className="flex items-center gap-0">
                    <button onClick={() => handleRunCommandSet(set)} disabled={busy}
                      className={`flex items-center gap-1.5 ${c.bg} border ${c.border} ${c.text} font-['JetBrains_Mono'] text-[10px] font-bold tracking-[0.5px] uppercase px-4 py-2 ${c.hover} transition-colors disabled:opacity-40`}>
                      <Play size={10} /> {isRunning ? 'Running...' : set.name}
                    </button>
                    <button onClick={() => openEditCmdSet(set)}
                      className={`border border-l-0 ${c.border} ${c.text} p-2 opacity-40 hover:opacity-100 transition-opacity`}>
                      <Pencil size={10} />
                    </button>
                    <button onClick={() => handleDeleteCmdSet(set.id)}
                      className={`border border-l-0 ${c.border} text-text-dim p-2 opacity-40 hover:opacity-100 hover:text-accent-red transition-all`}>
                      <Trash2 size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Deploy Output */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px]">// OUTPUT</span>
          </div>
          <Terminal lines={termLines} />
        </div>

        {/* Remote Execute */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TerminalSquare size={14} className="text-text-muted" />
            <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px]">// REMOTE_EXEC</span>
          </div>
          <form onSubmit={handleExec} className="flex gap-2">
            <input type="text" value={cmd} onChange={(e) => setCmd(e.target.value)}
              placeholder="$ enter command..."
              className="flex-1 bg-bg-input border border-border text-text-light font-['JetBrains_Mono'] text-xs px-4 py-2.5 focus:outline-none focus:border-accent-green/50 transition-colors" />
            <button type="submit" disabled={execLoading}
              className="bg-bg-input border border-border text-text-muted font-['JetBrains_Mono'] text-[10px] font-medium tracking-[0.5px] uppercase px-5 py-2.5 hover:text-accent-green hover:border-accent-green/30 transition-colors disabled:opacity-40">
              {execLoading ? 'Running...' : 'Execute'}
            </button>
          </form>
          {cmdResult && (
            <div className="mt-3 bg-bg-card border border-border p-4 font-['JetBrains_Mono'] text-xs max-h-64 overflow-auto">
              {cmdResult.stdout && <div className="text-accent-green/80 whitespace-pre-wrap">{cmdResult.stdout}</div>}
              {cmdResult.stderr && <div className="text-accent-yellow whitespace-pre-wrap">{cmdResult.stderr}</div>}
              <div className="text-text-dim mt-2 text-[10px] tracking-[1px] uppercase">exit_code: {cmdResult.code}</div>
            </div>
          )}
        </div>

        {/* Deploy History */}
        <div>
          <button onClick={() => setShowLogs(!showLogs)} className="flex items-center gap-2 group">
            <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px] group-hover:text-text-light transition-colors">
              // HISTORY ({logs.length})
            </span>
            {showLogs ? <ChevronUp size={14} className="text-text-dim" /> : <ChevronDown size={14} className="text-text-dim" />}
          </button>
          {showLogs && (
            <div className="mt-3 space-y-px bg-border">
              {logs.map((log, i) => (
                <div key={log.id} className={`p-4 ${i % 2 === 0 ? 'bg-bg-card' : 'bg-bg-alt'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px] uppercase">{log.action}</span>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={log.status} />
                      <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim">{new Date(log.started_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <pre className="font-['JetBrains_Mono'] text-[11px] text-text-dim max-h-32 overflow-auto whitespace-pre-wrap">{log.output}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Command Set Modal */}
      {showCmdSetModal && (
        <Modal title={editingCmdSet ? 'Edit Command Set' : 'New Command Set'} onClose={() => setShowCmdSetModal(false)}>
          <form onSubmit={handleCmdSetSubmit} className="space-y-4">
            <div>
              <label className="block font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase mb-1.5">Name</label>
              <input type="text" value={cmdSetForm.name} onChange={(e) => setCmdSetForm({ ...cmdSetForm, name: e.target.value })}
                placeholder="e.g. Update, Clear Cache, DB Migrate"
                className="w-full bg-bg-input border border-border text-text-light font-['Inter'] text-sm px-3 py-2.5 focus:outline-none focus:border-accent-green/50 transition-colors"
                required />
            </div>
            <div>
              <label className="block font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase mb-1.5">Commands</label>
              <textarea value={cmdSetForm.commands} onChange={(e) => setCmdSetForm({ ...cmdSetForm, commands: e.target.value })}
                placeholder={"git pull origin main\nnpm install\nnpm run build\npm2 restart all"}
                rows={5}
                className="w-full bg-bg-input border border-border text-text-light font-['JetBrains_Mono'] text-xs px-3 py-2.5 focus:outline-none focus:border-accent-green/50 transition-colors resize-y"
                required />
              <p className="font-['JetBrains_Mono'] text-[9px] text-text-dim mt-1 tracking-[0.5px]">One command per line. Runs sequentially. Stops on failure.</p>
            </div>
            <div>
              <label className="block font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase mb-1.5">Color</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setCmdSetForm({ ...cmdSetForm, color: c })}
                    className={`w-8 h-8 border-2 transition-all ${
                      cmdSetForm.color === c ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                    } ${colorMap[c].bg}`}
                    style={{ backgroundColor: c === 'green' ? '#00FF8820' : c === 'blue' ? '#3B82F620' : c === 'yellow' ? '#FFB80020' : c === 'orange' ? '#FF6B3520' : '#FF444420' }}
                  />
                ))}
              </div>
            </div>
            <button type="submit" className="w-full bg-accent-green/10 border border-accent-green/30 text-accent-green font-['JetBrains_Mono'] text-xs font-bold tracking-[1px] uppercase py-2.5 hover:bg-accent-green/15 hover:border-accent-green/50 transition-colors">
              {'>'} {editingCmdSet ? 'Update' : 'Create'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
