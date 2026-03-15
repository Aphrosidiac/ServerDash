import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import toast from 'react-hot-toast';
import { Plus, Trash2, Pencil, FolderGit2, Play } from 'lucide-react';

const colorMap = {
  green: { bg: 'bg-accent-green/8', border: 'border-accent-green/20', text: 'text-accent-green', hover: 'hover:bg-accent-green/15' },
  blue: { bg: 'bg-accent-blue/8', border: 'border-accent-blue/20', text: 'text-accent-blue', hover: 'hover:bg-accent-blue/15' },
  yellow: { bg: 'bg-accent-yellow/8', border: 'border-accent-yellow/20', text: 'text-accent-yellow', hover: 'hover:bg-accent-yellow/15' },
  orange: { bg: 'bg-accent-orange/8', border: 'border-accent-orange/20', text: 'text-accent-orange', hover: 'hover:bg-accent-orange/15' },
  red: { bg: 'bg-accent-red/8', border: 'border-accent-red/20', text: 'text-accent-red', hover: 'hover:bg-accent-red/15' },
};

const emptyForm = {
  server_id: '', name: '', path: '', repo_url: '', branch: 'main',
  build_command: '', restart_command: '',
};

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [servers, setServers] = useState([]);
  const [cmdSetsByProject, setCmdSetsByProject] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try {
      const [p, s] = await Promise.all([api.getProjects(), api.getServers()]);
      setProjects(p);
      setServers(s);
      const csMap = {};
      await Promise.all(p.map(async (proj) => {
        csMap[proj.id] = await api.getCommandSets(proj.id);
      }));
      setCmdSetsByProject(csMap);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...form, server_id: parseInt(form.server_id) };
      if (editing) { await api.updateProject(editing, data); toast.success('Project updated'); }
      else { await api.createProject(data); toast.success('Project created'); }
      setShowModal(false); setEditing(null); setForm(emptyForm); load();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this project?')) return;
    await api.deleteProject(id); toast.success('Project deleted'); load();
  };

  const handleRunCommandSet = async (setId) => {
    try {
      await api.runCommandSet(setId);
      toast.success('Running...');
    } catch (err) { toast.error(err.message); }
  };

  const openEdit = (project) => {
    setEditing(project.id);
    setForm({
      server_id: project.server_id.toString(), name: project.name, path: project.path,
      repo_url: project.repo_url || '', branch: project.branch || 'main',
      build_command: project.build_command || '', restart_command: project.restart_command || '',
    });
    setShowModal(true);
  };

  if (loading) return <div className="p-8 text-text-dim font-['JetBrains_Mono'] text-xs">indexing<span className="animate-pulse">_</span></div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-8 bg-bg-sidebar border-b border-border">
        <div className="flex items-center gap-3">
          <span className="font-['Space_Grotesk'] text-lg font-bold text-white tracking-[-0.5px]">Projects</span>
          <span className="font-['JetBrains_Mono'] text-[11px] text-text-muted">// Deploy Targets</span>
        </div>
        <button
          onClick={() => { setEditing(null); setForm({ ...emptyForm, server_id: servers[0]?.id?.toString() || '' }); setShowModal(true); }}
          disabled={servers.length === 0}
          className="flex items-center gap-2 bg-bg-input border border-border text-text-muted font-['JetBrains_Mono'] text-[11px] font-medium tracking-[0.5px] uppercase px-4 py-2 hover:text-accent-green hover:border-accent-green/30 transition-colors disabled:opacity-40"
        >
          <Plus size={14} /> Add Project
        </button>
      </div>

      <div className="p-8">
        {servers.length === 0 && (
          <div className="bg-bg-card border border-accent-yellow/20 p-6 text-center mb-6">
            <p className="font-['JetBrains_Mono'] text-xs text-accent-yellow">
              {'>'} warning: no_servers. <Link to="/servers" className="text-accent-green hover:underline">register_server_first</Link>
            </p>
          </div>
        )}

        {projects.length === 0 && servers.length > 0 ? (
          <div className="bg-bg-card border border-border p-16 text-center">
            <FolderGit2 size={28} className="text-text-dim mx-auto mb-3" />
            <p className="text-text-dim font-['JetBrains_Mono'] text-xs">{'>'} no_projects_found</p>
          </div>
        ) : (
          <div className="space-y-px bg-border">
            {projects.map((project, i) => {
              const sets = cmdSetsByProject[project.id] || [];
              return (
                <div key={project.id} className={`px-6 py-4 ${i % 2 === 0 ? 'bg-bg-card' : 'bg-bg-alt'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 flex items-center justify-center bg-accent-green/8 border border-accent-green/15">
                        <FolderGit2 size={16} className="text-accent-green" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <Link to={`/projects/${project.id}`} className="font-['Inter'] text-sm font-semibold text-text-light hover:text-accent-green transition-colors">
                            {project.name}
                          </Link>
                          <StatusBadge status={project.status} />
                        </div>
                        <p className="font-['JetBrains_Mono'] text-[11px] text-text-dim mt-0.5">
                          {project.server_name} // {project.path}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Command set buttons */}
                      {sets.map(set => {
                        const c = colorMap[set.color] || colorMap.green;
                        return (
                          <button key={set.id} onClick={() => handleRunCommandSet(set.id)}
                            className={`flex items-center gap-1.5 ${c.bg} border ${c.border} ${c.text} font-['JetBrains_Mono'] text-[10px] font-semibold tracking-[0.5px] uppercase px-3 py-1.5 ${c.hover} transition-colors`}>
                            <Play size={10} /> {set.name}
                          </button>
                        );
                      })}
                      <Link to={`/projects/${project.id}`}
                        className="font-['JetBrains_Mono'] text-[10px] font-semibold text-accent-green tracking-[0.5px] uppercase bg-accent-green/6 border border-accent-green/20 px-3 py-1.5 hover:bg-accent-green/10 transition-colors">
                        Open
                      </Link>
                      <button onClick={() => openEdit(project)} className="p-2 border border-border text-text-dim hover:text-text-light hover:border-text-muted/30 transition-colors">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDelete(project.id)} className="p-2 border border-border text-text-dim hover:text-accent-red hover:border-accent-red/30 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <Modal title={editing ? 'Modify Project' : 'New Project'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase mb-1.5">Server</label>
              <select value={form.server_id} onChange={(e) => setForm({ ...form, server_id: e.target.value })}
                className="w-full bg-bg-input border border-border text-text-light font-['Inter'] text-sm px-3 py-2.5 focus:outline-none focus:border-accent-green/50 transition-colors" required>
                <option value="">Select server...</option>
                {servers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.host})</option>)}
              </select>
            </div>
            {[
              { label: 'Project Name', key: 'name', placeholder: 'my-app', required: true },
              { label: 'Remote Path', key: 'path', placeholder: '/home/user/myapp', required: true },
              { label: 'Repository URL', key: 'repo_url', placeholder: 'https://github.com/...' },
              { label: 'Branch', key: 'branch', placeholder: 'main' },
              { label: 'Build Command (for Deploy)', key: 'build_command', placeholder: 'npm run build' },
              { label: 'Restart Command (for Deploy)', key: 'restart_command', placeholder: 'pm2 restart app' },
            ].map(({ label, key, placeholder, required }) => (
              <div key={key}>
                <label className="block font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase mb-1.5">{label}</label>
                <input type="text" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full bg-bg-input border border-border text-text-light font-['Inter'] text-sm px-3 py-2.5 focus:outline-none focus:border-accent-green/50 transition-colors"
                  required={required} />
              </div>
            ))}
            <p className="font-['JetBrains_Mono'] text-[9px] text-text-dim tracking-[0.5px]">
              Custom command sets can be added after creating the project.
            </p>
            <button type="submit" className="w-full bg-accent-green/10 border border-accent-green/30 text-accent-green font-['JetBrains_Mono'] text-xs font-bold tracking-[1px] uppercase py-2.5 hover:bg-accent-green/15 hover:border-accent-green/50 transition-colors">
              {'>'} {editing ? 'Update' : 'Create'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
