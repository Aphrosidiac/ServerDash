import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { getSocket } from '../socket';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import Terminal from '../components/Terminal';
import toast from 'react-hot-toast';
import { GitBranch, Plus, Trash2, Pencil, ArrowRight, Rocket, RotateCcw, Server, FolderOpen, Zap, ChevronDown, ChevronUp, X } from 'lucide-react';

const ENV_PRESETS = [
  { name: 'development', branch: 'dev', order: 0 },
  { name: 'staging', branch: 'staging', order: 1 },
  { name: 'production', branch: 'main', order: 2 },
];

const emptyEnvForm = {
  project_id: '', name: '', server_id: '', branch: 'main', path: '',
  build_command: '', restart_command: '', auto_deploy: false, deploy_order: 0,
};

export default function Pipelines() {
  const [projects, setProjects] = useState([]);
  const [servers, setServers] = useState([]);
  const [envsByProject, setEnvsByProject] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyEnvForm);
  const [expandedProject, setExpandedProject] = useState(null);
  const [termLines, setTermLines] = useState([]);
  const [activeEnv, setActiveEnv] = useState(null);
  const [envLogs, setEnvLogs] = useState({});
  const [showLogsFor, setShowLogsFor] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([api.getProjects(), api.getServers()]);
      setProjects(p);
      setServers(s);

      const envMap = {};
      await Promise.all(p.map(async (proj) => {
        const envs = await api.getEnvironments(proj.id);
        envMap[proj.id] = envs;
      }));
      setEnvsByProject(envMap);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Socket listener for deploy output
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    projects.forEach(p => socket.emit('join:project', p.id));

    const handler = (data) => {
      setTermLines(prev => [...prev, { type: data.type, data: data.data, envName: data.envName }]);
      if (data.type === 'info' && data.data.includes('completed')) { loadAll(); }
      if (data.type === 'error') { loadAll(); }
    };
    socket.on('deploy:output', handler);
    return () => {
      socket.off('deploy:output', handler);
      projects.forEach(p => socket.emit('leave:project', p.id));
    };
  }, [projects.length, loadAll]);

  const handleDeploy = async (envId, envName) => {
    setActiveEnv(envName);
    setTermLines([]);
    try { await api.deployEnvironment(envId); } catch (err) { toast.error(err.message); }
  };

  const handlePromote = async (envId, envName) => {
    setActiveEnv(envName);
    setTermLines([]);
    try {
      const result = await api.promoteEnvironment(envId);
      toast.success(`Promoting ${result.fromEnv} → ${result.toEnv}`);
    } catch (err) { toast.error(err.message); }
  };

  const handleRollback = async (envId) => {
    if (!confirm('Rollback to previous deployment?')) return;
    setTermLines([]);
    try {
      const result = await api.rollbackEnvironment(envId);
      toast.success(`Rolling back to ${result.commit.substring(0, 7)}`);
    } catch (err) { toast.error(err.message); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...form, server_id: parseInt(form.server_id), project_id: parseInt(form.project_id), deploy_order: parseInt(form.deploy_order) };
      if (editing) { await api.updateEnvironment(editing, data); toast.success('Environment updated'); }
      else { await api.createEnvironment(data); toast.success('Environment created'); }
      setShowModal(false); setEditing(null); setForm(emptyEnvForm); loadAll();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this environment?')) return;
    await api.deleteEnvironment(id); toast.success('Deleted'); loadAll();
  };

  const openAddEnv = (projectId) => {
    setEditing(null);
    setForm({ ...emptyEnvForm, project_id: projectId.toString(), server_id: servers[0]?.id?.toString() || '' });
    setShowModal(true);
  };

  const openEditEnv = (env) => {
    setEditing(env.id);
    setForm({
      project_id: env.project_id.toString(), name: env.name, server_id: env.server_id.toString(),
      branch: env.branch, path: env.path, build_command: env.build_command || '',
      restart_command: env.restart_command || '', auto_deploy: !!env.auto_deploy,
      deploy_order: env.deploy_order || 0,
    });
    setShowModal(true);
  };

  const loadLogs = async (envId) => {
    if (showLogsFor === envId) { setShowLogsFor(null); return; }
    const logs = await api.getEnvironmentLogs(envId);
    setEnvLogs(prev => ({ ...prev, [envId]: logs }));
    setShowLogsFor(envId);
  };

  const getStatusColor = (status) => {
    const map = {
      deployed: 'border-accent-green/40 bg-accent-green/5',
      deploying: 'border-accent-blue/40 bg-accent-blue/5',
      failed: 'border-accent-red/40 bg-accent-red/5',
      rolling_back: 'border-accent-yellow/40 bg-accent-yellow/5',
      idle: 'border-border bg-bg-card',
    };
    return map[status] || map.idle;
  };

  if (loading) return <div className="p-8 text-text-dim font-['JetBrains_Mono'] text-xs">indexing<span className="animate-pulse">_</span></div>;

  // Only show projects that have environments
  const projectsWithEnvs = projects.filter(p => (envsByProject[p.id] || []).length > 0);
  const projectsWithoutEnvs = projects.filter(p => (envsByProject[p.id] || []).length === 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-8 bg-bg-sidebar border-b border-border">
        <div className="flex items-center gap-3">
          <span className="font-['Space_Grotesk'] text-lg font-bold text-white tracking-[-0.5px]">Pipelines</span>
          <span className="font-['JetBrains_Mono'] text-[11px] text-text-muted">// Deploy Flow</span>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Live Terminal */}
        {termLines.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px]">
                // PIPELINE_OUTPUT {activeEnv && <span className="text-accent-blue">— {activeEnv}</span>}
              </span>
              <button onClick={() => setTermLines([])} className="p-1 text-text-dim hover:text-text-light transition-colors"><X size={14} /></button>
            </div>
            <Terminal lines={termLines} />
          </div>
        )}

        {/* Pipeline Cards */}
        {projectsWithEnvs.map(project => {
          const envs = envsByProject[project.id] || [];
          const isExpanded = expandedProject === project.id;

          return (
            <div key={project.id} className="bg-bg-card border border-border">
              {/* Project Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border cursor-pointer"
                onClick={() => setExpandedProject(isExpanded ? null : project.id)}>
                <div className="flex items-center gap-3">
                  <GitBranch size={16} className="text-accent-green" />
                  <span className="font-['Inter'] text-sm font-semibold text-white">{project.name}</span>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim">{envs.length} environments</span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={(e) => { e.stopPropagation(); openAddEnv(project.id); }}
                    className="flex items-center gap-1.5 text-text-dim hover:text-accent-green font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.5px] transition-colors">
                    <Plus size={12} /> Add Env
                  </button>
                  {isExpanded ? <ChevronUp size={14} className="text-text-dim" /> : <ChevronDown size={14} className="text-text-dim" />}
                </div>
              </div>

              {/* Pipeline Flow — always visible */}
              <div className="px-6 py-5">
                <div className="flex items-center gap-3 overflow-x-auto">
                  {envs.map((env, i) => (
                    <div key={env.id} className="flex items-center gap-3">
                      {/* Environment Card */}
                      <div className={`border ${getStatusColor(env.status)} min-w-[200px] p-4`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-['JetBrains_Mono'] text-[11px] font-bold text-text-light uppercase tracking-[1px]">{env.name}</span>
                          <StatusBadge status={env.status === 'deployed' ? 'running' : env.status} />
                        </div>
                        <div className="space-y-1 mb-3">
                          <div className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] text-text-dim">
                            <GitBranch size={10} /> {env.branch}
                          </div>
                          <div className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] text-text-dim">
                            <Server size={10} /> {env.server_name}
                          </div>
                          {env.last_commit && (
                            <div className="font-['JetBrains_Mono'] text-[10px] text-accent-green/70">
                              #{env.last_commit.substring(0, 7)}
                            </div>
                          )}
                          {env.auto_deploy ? (
                            <div className="flex items-center gap-1 font-['JetBrains_Mono'] text-[9px] text-accent-yellow">
                              <Zap size={9} /> auto-deploy
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleDeploy(env.id, env.name)}
                            disabled={env.status === 'deploying'}
                            className="flex-1 flex items-center justify-center gap-1 bg-accent-green/8 border border-accent-green/20 text-accent-green font-['JetBrains_Mono'] text-[9px] font-bold uppercase tracking-[0.5px] py-1.5 hover:bg-accent-green/15 transition-colors disabled:opacity-40">
                            <Rocket size={10} /> Deploy
                          </button>
                          {i < envs.length - 1 && env.last_commit && (
                            <button onClick={() => handlePromote(env.id, env.name)}
                              className="flex items-center justify-center gap-1 bg-accent-blue/8 border border-accent-blue/20 text-accent-blue font-['JetBrains_Mono'] text-[9px] font-bold uppercase tracking-[0.5px] px-2 py-1.5 hover:bg-accent-blue/15 transition-colors">
                              <ArrowRight size={10} />
                            </button>
                          )}
                          {env.last_commit && (
                            <button onClick={() => handleRollback(env.id)}
                              className="flex items-center justify-center bg-accent-yellow/8 border border-accent-yellow/20 text-accent-yellow font-['JetBrains_Mono'] text-[9px] px-2 py-1.5 hover:bg-accent-yellow/15 transition-colors">
                              <RotateCcw size={10} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Arrow between environments */}
                      {i < envs.length - 1 && (
                        <ArrowRight size={16} className="text-text-dim flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Expanded: details, logs, edit/delete */}
              {isExpanded && (
                <div className="px-6 pb-5 space-y-4 border-t border-border pt-4">
                  {envs.map(env => (
                    <div key={env.id} className="bg-bg-alt border border-border p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-['JetBrains_Mono'] text-xs font-bold text-text-light uppercase">{env.name}</span>
                          <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim">
                            <FolderOpen size={10} className="inline mr-1" />{env.path}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => loadLogs(env.id)}
                            className="font-['JetBrains_Mono'] text-[10px] text-text-dim hover:text-text-light transition-colors">
                            {showLogsFor === env.id ? 'Hide Logs' : 'Logs'}
                          </button>
                          <button onClick={() => openEditEnv(env)} className="p-1.5 border border-border text-text-dim hover:text-text-light transition-colors">
                            <Pencil size={11} />
                          </button>
                          <button onClick={() => handleDelete(env.id)} className="p-1.5 border border-border text-text-dim hover:text-accent-red transition-colors">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 font-['JetBrains_Mono'] text-[10px] text-text-dim">
                        <div>branch: <span className="text-text-muted">{env.branch}</span></div>
                        <div>server: <span className="text-text-muted">{env.server_name} ({env.server_host})</span></div>
                        {env.build_command && <div>build: <span className="text-text-muted">{env.build_command}</span></div>}
                        {env.restart_command && <div>restart: <span className="text-text-muted">{env.restart_command}</span></div>}
                        <div>auto_deploy: <span className={env.auto_deploy ? 'text-accent-green' : 'text-text-dim'}>{env.auto_deploy ? 'on' : 'off'}</span></div>
                        {env.last_deployed_at && <div>last_deploy: <span className="text-text-muted">{new Date(env.last_deployed_at).toLocaleString()}</span></div>}
                      </div>

                      {/* Deploy logs */}
                      {showLogsFor === env.id && (
                        <div className="mt-3 space-y-1">
                          {(envLogs[env.id] || []).length === 0 ? (
                            <div className="font-['JetBrains_Mono'] text-[10px] text-text-dim py-2">No deploy history</div>
                          ) : (envLogs[env.id] || []).map(log => (
                            <div key={log.id} className="flex items-center justify-between bg-bg-card border border-border px-3 py-2">
                              <div className="flex items-center gap-3">
                                <StatusBadge status={log.status} />
                                <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim">
                                  {log.commit_hash ? `#${log.commit_hash.substring(0, 7)}` : '—'}
                                </span>
                              </div>
                              <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim">
                                {new Date(log.started_at).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Projects without pipelines */}
        {projectsWithoutEnvs.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px]">
                // NO_PIPELINE ({projectsWithoutEnvs.length})
              </span>
            </div>
            <div className="space-y-px bg-border">
              {projectsWithoutEnvs.map((project, i) => (
                <div key={project.id} className={`flex items-center justify-between px-6 py-3 ${i % 2 === 0 ? 'bg-bg-card' : 'bg-bg-alt'}`}>
                  <span className="font-['Inter'] text-sm text-text-muted">{project.name}</span>
                  <button onClick={() => openAddEnv(project.id)}
                    className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] text-accent-green uppercase tracking-[0.5px] hover:underline">
                    <Plus size={12} /> Setup Pipeline
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {projects.length === 0 && (
          <div className="bg-bg-card border border-border p-16 text-center">
            <GitBranch size={28} className="text-text-dim mx-auto mb-3" />
            <p className="text-text-dim font-['JetBrains_Mono'] text-xs">{'>'} create_projects_first</p>
          </div>
        )}
      </div>

      {/* Add/Edit Environment Modal */}
      {showModal && (
        <Modal title={editing ? 'Edit Environment' : 'Add Environment'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editing && (
              <div>
                <label className="block font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase mb-1.5">Quick Setup</label>
                <div className="flex gap-2">
                  {ENV_PRESETS.map(preset => (
                    <button key={preset.name} type="button"
                      onClick={() => setForm({ ...form, name: preset.name, branch: preset.branch, deploy_order: preset.order })}
                      className={`flex-1 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.5px] py-2 border transition-colors ${
                        form.name === preset.name ? 'border-accent-green/50 text-accent-green bg-accent-green/10' : 'border-border text-text-dim hover:text-text-light'
                      }`}>
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase mb-1.5">Server</label>
              <select value={form.server_id} onChange={(e) => setForm({ ...form, server_id: e.target.value })}
                className="w-full bg-bg-input border border-border text-text-light font-['Inter'] text-sm px-3 py-2.5 focus:outline-none focus:border-accent-green/50 transition-colors" required>
                <option value="">Select server...</option>
                {servers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.host})</option>)}
              </select>
            </div>
            {[
              { label: 'Environment Name', key: 'name', placeholder: 'development', required: true },
              { label: 'Branch', key: 'branch', placeholder: 'dev' },
              { label: 'Remote Path', key: 'path', placeholder: '/var/www/myapp-dev', required: true },
              { label: 'Build Command', key: 'build_command', placeholder: 'npm run build' },
              { label: 'Restart Command', key: 'restart_command', placeholder: 'pm2 restart app' },
              { label: 'Deploy Order', key: 'deploy_order', placeholder: '0 = first, 1 = second, 2 = third' },
            ].map(({ label, key, placeholder, required }) => (
              <div key={key}>
                <label className="block font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase mb-1.5">{label}</label>
                <input type={key === 'deploy_order' ? 'number' : 'text'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full bg-bg-input border border-border text-text-light font-['Inter'] text-sm px-3 py-2.5 focus:outline-none focus:border-accent-green/50 transition-colors"
                  required={required} />
              </div>
            ))}
            <div className="flex items-center gap-3">
              <input type="checkbox" id="auto_deploy" checked={form.auto_deploy} onChange={(e) => setForm({ ...form, auto_deploy: e.target.checked })}
                className="accent-accent-green" />
              <label htmlFor="auto_deploy" className="font-['JetBrains_Mono'] text-[11px] text-text-muted">
                Auto-deploy on push to this branch (via webhook)
              </label>
            </div>
            <button type="submit" className="w-full bg-accent-green/10 border border-accent-green/30 text-accent-green font-['JetBrains_Mono'] text-xs font-bold tracking-[1px] uppercase py-2.5 hover:bg-accent-green/15 hover:border-accent-green/50 transition-colors">
              {'>'} {editing ? 'Update' : 'Create'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
