import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { Plus, Trash2, Wifi, WifiOff, Pencil, Server, Key, FileKey, Lock } from 'lucide-react';

const emptyForm = { name: '', host: '', username: 'root', auth_type: 'password', private_key_path: '', private_key: '', server_password: '' };

export default function Servers() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [testing, setTesting] = useState(null);
  const nav = useNavigate();

  const load = () => api.getServers().then(setServers).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.updateServer(editing, form); toast.success('Node updated'); }
      else { await api.createServer(form); toast.success('Node registered'); }
      setShowModal(false); setEditing(null); setForm(emptyForm); load();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Decommission this node and all linked projects?')) return;
    await api.deleteServer(id); toast.success('Node removed'); load();
  };

  const handleTest = async (id) => {
    setTesting(id);
    try {
      const result = await api.testServer(id);
      result.success ? toast.success('Connection OK') : toast.error(`Failed: ${result.message}`);
    } catch (err) { toast.error(err.message); }
    setTesting(null);
  };

  const openEdit = (server) => {
    setEditing(server.id);
    setForm({
      name: server.name, host: server.host, username: server.username,
      auth_type: server.auth_type || 'password',
      private_key_path: server.private_key_path || '', private_key: '', server_password: '',
    });
    setShowModal(true);
  };

  if (loading) return <div className="p-8 text-text-dim font-['JetBrains_Mono'] text-xs">scanning_nodes<span className="animate-pulse">_</span></div>;

  const authModes = [
    { key: 'password', icon: Lock, label: 'Password' },
    { key: 'key_paste', icon: Key, label: 'Paste Key' },
    { key: 'key_path', icon: FileKey, label: 'Key File' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-8 bg-bg-sidebar border-b border-border">
        <div className="flex items-center gap-3">
          <span className="font-['Space_Grotesk'] text-lg font-bold text-white tracking-[-0.5px]">Servers</span>
          <span className="font-['JetBrains_Mono'] text-[11px] text-text-muted">// Node Management</span>
        </div>
        <button
          onClick={() => { setEditing(null); setForm(emptyForm); setShowModal(true); }}
          className="flex items-center gap-2 bg-bg-input border border-border text-text-muted font-['JetBrains_Mono'] text-[11px] font-medium tracking-[0.5px] uppercase px-4 py-2 hover:text-accent-green hover:border-accent-green/30 transition-colors"
        >
          <Plus size={14} /> Add Server
        </button>
      </div>

      {/* Content */}
      <div className="p-8">
        {servers.length === 0 ? (
          <div className="bg-bg-card border border-border p-16 text-center">
            <Server size={28} className="text-text-dim mx-auto mb-3" />
            <p className="text-text-dim font-['JetBrains_Mono'] text-xs">{'>'} no_nodes_detected</p>
          </div>
        ) : (
          <div className="space-y-px bg-border">
            {servers.map((server, i) => (
              <div key={server.id} className={`flex items-center justify-between px-6 py-4 ${i % 2 === 0 ? 'bg-bg-card' : 'bg-bg-alt'} cursor-pointer hover:bg-white/[0.02] transition-colors`} onClick={() => nav(`/servers/${server.id}`)}>
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 flex items-center justify-center bg-accent-blue/10 border border-accent-blue/20">
                    <Server size={16} className="text-accent-blue" />
                  </div>
                  <div>
                    <span className="font-['Inter'] text-sm font-semibold text-text-light">{server.name}</span>
                    <p className="font-['JetBrains_Mono'] text-[11px] text-text-dim mt-0.5">
                      {server.username}@{server.host}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleTest(server.id)} disabled={testing === server.id}
                    className="flex items-center gap-1.5 bg-bg-input border border-border text-text-muted font-['JetBrains_Mono'] text-[10px] font-medium tracking-[0.5px] uppercase px-3 py-1.5 hover:text-accent-green hover:border-accent-green/30 transition-colors disabled:opacity-40">
                    {testing === server.id ? <WifiOff size={12} className="animate-pulse" /> : <Wifi size={12} />} Ping
                  </button>
                  <button onClick={() => openEdit(server)} className="p-2 border border-border text-text-dim hover:text-text-light hover:border-text-muted/30 transition-colors">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => handleDelete(server.id)} className="p-2 border border-border text-text-dim hover:text-accent-red hover:border-accent-red/30 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <Modal title={editing ? 'Modify Node' : 'Register Node'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: 'Name', key: 'name', placeholder: 'Production-01' },
              { label: 'Host', key: 'host', placeholder: '192.168.1.100' },
              { label: 'Username', key: 'username', placeholder: 'root' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase mb-1.5">{label}</label>
                <input type="text" value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full bg-bg-input border border-border text-text-light font-['Inter'] text-sm px-3 py-2.5 focus:outline-none focus:border-accent-green/50 transition-colors"
                  required />
              </div>
            ))}

            {/* Auth Method */}
            <div>
              <label className="block font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase mb-2">Authentication</label>
              <div className="flex gap-px mb-3">
                {authModes.map(({ key, icon: Icon, label }) => (
                  <button key={key} type="button" onClick={() => setForm({ ...form, auth_type: key })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 font-['JetBrains_Mono'] text-[10px] font-medium tracking-[0.5px] uppercase border transition-colors ${
                      form.auth_type === key ? 'border-accent-green/30 text-accent-green bg-accent-green/6' : 'border-border text-text-dim hover:text-text-muted'
                    }`}>
                    <Icon size={10} /> {label}
                  </button>
                ))}
              </div>

              {form.auth_type === 'password' && (
                <input type="password" value={form.server_password}
                  onChange={(e) => setForm({ ...form, server_password: e.target.value })}
                  placeholder="Server password"
                  className="w-full bg-bg-input border border-border text-text-light font-['Inter'] text-sm px-3 py-2.5 focus:outline-none focus:border-accent-green/50 transition-colors"
                  required />
              )}

              {form.auth_type === 'key_paste' && (
                <textarea value={form.private_key}
                  onChange={(e) => setForm({ ...form, private_key: e.target.value })}
                  placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\npaste your full private key here...\n-----END OPENSSH PRIVATE KEY-----"}
                  className="w-full bg-bg-input border border-border text-text-light font-['JetBrains_Mono'] text-xs px-3 py-2.5 h-36 resize-none focus:outline-none focus:border-accent-green/50 transition-colors"
                  required />
              )}

              {form.auth_type === 'key_path' && (
                <input type="text" value={form.private_key_path}
                  onChange={(e) => setForm({ ...form, private_key_path: e.target.value })}
                  placeholder="C:\Users\you\.ssh\id_rsa"
                  className="w-full bg-bg-input border border-border text-text-light font-['Inter'] text-sm px-3 py-2.5 focus:outline-none focus:border-accent-green/50 transition-colors"
                  required />
              )}
            </div>

            <button type="submit" className="w-full bg-accent-green/10 border border-accent-green/30 text-accent-green font-['JetBrains_Mono'] text-xs font-bold tracking-[1px] uppercase py-2.5 hover:bg-accent-green/15 hover:border-accent-green/50 transition-colors">
              {'>'} {editing ? 'Update Node' : 'Register Node'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
