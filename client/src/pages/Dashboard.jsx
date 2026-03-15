import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { getSocket } from '../socket';
import StatusBadge from '../components/StatusBadge';
import Terminal from '../components/Terminal';
import toast from 'react-hot-toast';
import { Server, FolderGit2, Rocket, AlertTriangle, Play, X } from 'lucide-react';

const colorMap = {
  green: { bg: 'bg-accent-green/8', border: 'border-accent-green/20', text: 'text-accent-green' },
  blue: { bg: 'bg-accent-blue/8', border: 'border-accent-blue/20', text: 'text-accent-blue' },
  yellow: { bg: 'bg-accent-yellow/8', border: 'border-accent-yellow/20', text: 'text-accent-yellow' },
  orange: { bg: 'bg-accent-orange/8', border: 'border-accent-orange/20', text: 'text-accent-orange' },
  red: { bg: 'bg-accent-red/8', border: 'border-accent-red/20', text: 'text-accent-red' },
};

export default function Dashboard() {
  const [servers, setServers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [termLines, setTermLines] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [cmdSetsByProject, setCmdSetsByProject] = useState({});

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([api.getServers(), api.getProjects()]);
      setServers(s);
      setProjects(p);
      const csMap = {};
      await Promise.all(p.map(async (proj) => {
        csMap[proj.id] = await api.getCommandSets(proj.id);
      }));
      setCmdSetsByProject(csMap);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Listen to deploy:output for ALL projects
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Join all project rooms
    projects.forEach(p => socket.emit('join:project', p.id));

    const handler = (data) => {
      setTermLines((prev) => [...prev, { type: data.type, data: data.data, projectId: data.projectId }]);
      if (data.type === 'info' && data.data.includes('completed successfully')) { load(); }
      if (data.type === 'error' && (data.data.includes('Deployment error') || data.data.includes('Update error'))) { load(); }
    };
    socket.on('deploy:output', handler);

    return () => {
      socket.off('deploy:output', handler);
      projects.forEach(p => socket.emit('leave:project', p.id));
    };
  }, [projects.length, load]);

  const handleRunCommandSet = async (setId, project) => {
    setActiveProject(project);
    setTermLines([]);
    try {
      await api.runCommandSet(setId);
    } catch (err) { toast.error(err.message); setActiveProject(null); }
  };

  const clearTerminal = () => {
    setTermLines([]);
    setActiveProject(null);
  };

  if (loading) {
    return (
      <div className="p-8 text-text-dim font-['JetBrains_Mono'] text-xs">
        loading<span className="animate-pulse">_</span>
      </div>
    );
  }

  const stats = [
    { label: 'Servers', value: servers.length, icon: Server, color: 'text-accent-blue' },
    { label: 'Projects', value: projects.length, icon: FolderGit2, color: 'text-accent-green' },
    { label: 'Running', value: projects.filter(p => p.status === 'running').length, icon: Rocket, color: 'text-accent-green' },
    { label: 'Failed', value: projects.filter(p => p.status === 'failed').length, icon: AlertTriangle, color: 'text-accent-red' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-8 bg-bg-sidebar border-b border-border">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-accent-green" />
            <span className="font-['Inter'] text-base font-semibold text-white">Server Dashboard</span>
          </div>
          <StatusBadge status="running" />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-['Inter'] text-xs text-text-dim">Updated: just now</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-8 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-bg-card border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase">{label}</span>
                <Icon size={16} className={color} />
              </div>
              <span className="font-['Space_Grotesk'] text-3xl font-bold text-white">
                {String(value).padStart(2, '0')}
              </span>
            </div>
          ))}
        </div>

        {/* Live Terminal */}
        {(termLines.length > 0 || activeProject) && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px]">
                  // LIVE_OUTPUT {activeProject && <span className="text-accent-blue">— {activeProject.name}</span>}
                </span>
              </div>
              <button onClick={clearTerminal} className="p-1 text-text-dim hover:text-text-light transition-colors">
                <X size={14} />
              </button>
            </div>
            <Terminal lines={termLines} />
          </div>
        )}

        {/* Table Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px]">
              // PROJECT_OVERVIEW
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] font-bold text-accent-green bg-accent-green/10 px-2 py-0.5 border border-accent-green/20">
              {projects.length} ENTRIES
            </span>
          </div>
        </div>

        {/* Projects Table */}
        <div className="bg-bg-card border border-border overflow-hidden">
          {projects.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-text-dim font-['JetBrains_Mono'] text-xs">
                {'>'} no_projects_found. <Link to="/projects" className="text-accent-green hover:underline">create_project</Link>
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-bg-alt border-b border-border">
                  {['Project', 'Server', 'Status', 'Last Deploy', ''].map((h) => (
                    <th key={h} className="px-6 py-2.5 text-left font-['JetBrains_Mono'] text-[10px] font-semibold text-text-dim tracking-[1.5px] uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((project, i) => (
                  <tr key={project.id} className={`border-b border-border ${i % 2 === 0 ? 'bg-bg-card' : 'bg-bg-alt'}`}>
                    <td className="px-6 py-3 font-['Inter'] text-sm font-medium text-text-light">{project.name}</td>
                    <td className="px-6 py-3 font-['JetBrains_Mono'] text-xs text-text-muted">{project.server_name}</td>
                    <td className="px-6 py-3"><StatusBadge status={project.status} /></td>
                    <td className="px-6 py-3 font-['JetBrains_Mono'] text-xs text-text-dim">
                      {project.last_deployed_at ? new Date(project.last_deployed_at).toLocaleString() : 'never'}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {(cmdSetsByProject[project.id] || []).slice(0, 3).map(set => {
                          const c = colorMap[set.color] || colorMap.green;
                          return (
                            <button key={set.id} onClick={() => handleRunCommandSet(set.id, project)}
                              className={`flex items-center gap-1 font-['JetBrains_Mono'] text-[10px] font-semibold tracking-[0.5px] uppercase ${c.bg} border ${c.border} ${c.text} px-3 py-1.5 hover:opacity-80 transition-opacity`}>
                              <Play size={9} /> {set.name}
                            </button>
                          );
                        })}
                        <Link to={`/projects/${project.id}`} className="font-['JetBrains_Mono'] text-[10px] font-semibold text-accent-green tracking-[0.5px] uppercase hover:underline">
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
