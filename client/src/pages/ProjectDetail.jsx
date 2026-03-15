import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { getSocket } from '../socket';
import Terminal from '../components/Terminal';
import StatusBadge from '../components/StatusBadge';
import toast from 'react-hot-toast';
import { Rocket, RefreshCw, TerminalSquare, ArrowLeft, GitBranch, FolderOpen, ChevronDown, ChevronUp, ArrowUpCircle } from 'lucide-react';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [logs, setLogs] = useState([]);
  const [termLines, setTermLines] = useState([]);
  const [deploying, setDeploying] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [cmd, setCmd] = useState('');
  const [cmdResult, setCmdResult] = useState(null);
  const [execLoading, setExecLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const load = useCallback(() => {
    api.getProject(id).then(setProject);
    api.getProjectLogs(id).then(setLogs);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('join:project', parseInt(id));
    const handler = (data) => {
      setTermLines((prev) => [...prev, { type: data.type, data: data.data }]);
      if (data.type === 'info' && data.data.includes('completed successfully')) { setDeploying(false); setUpdating(false); load(); }
      if (data.type === 'error' && (data.data.includes('Deployment error') || data.data.includes('Update error'))) { setDeploying(false); setUpdating(false); load(); }
    };
    socket.on('deploy:output', handler);
    return () => { socket.off('deploy:output', handler); socket.emit('leave:project', parseInt(id)); };
  }, [id, load]);

  const handleDeploy = async () => {
    setDeploying(true); setTermLines([]);
    try { await api.deployProject(id); } catch (err) { toast.error(err.message); setDeploying(false); }
  };

  const handleUpdate = async () => {
    setUpdating(true); setTermLines([]);
    try { await api.runUpdate(id); } catch (err) { toast.error(err.message); setUpdating(false); }
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

  if (!project) return <div className="p-8 text-text-dim font-['JetBrains_Mono'] text-xs">loading<span className="animate-pulse">_</span></div>;

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
          <button onClick={handleUpdate} disabled={updating || deploying}
            className="flex items-center gap-1.5 bg-accent-blue/10 border border-accent-blue/30 text-accent-blue font-['JetBrains_Mono'] text-[10px] font-bold tracking-[1px] uppercase px-4 py-2 hover:bg-accent-blue/15 hover:border-accent-blue/50 transition-colors disabled:opacity-40">
            <ArrowUpCircle size={12} /> {updating ? 'Updating...' : 'Update'}
          </button>
          <button onClick={handleDeploy} disabled={deploying || updating}
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

        {/* Deploy Output */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px]">// DEPLOY_OUTPUT</span>
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
              // DEPLOY_HISTORY ({logs.length})
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
    </div>
  );
}
