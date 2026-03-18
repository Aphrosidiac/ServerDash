import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { Database, Play, Clock, Trash2, Key, Save, X, ChevronDown, Loader2, Table2, Columns3, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const ENGINE_LABELS = { mysql: 'MySQL', postgresql: 'PostgreSQL', mongodb: 'MongoDB' };
const ENGINE_COLORS = {
  mysql: { bg: 'bg-accent-blue/10', border: 'border-accent-blue/30', text: 'text-accent-blue' },
  postgresql: { bg: 'bg-accent-green/10', border: 'border-accent-green/30', text: 'text-accent-green' },
  mongodb: { bg: 'bg-accent-orange/10', border: 'border-accent-orange/30', text: 'text-accent-orange' },
};

export default function Databases() {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState('');
  const [engines, setEngines] = useState([]);
  const [activeEngine, setActiveEngine] = useState('');
  const [detecting, setDetecting] = useState(false);

  // 3-panel state
  const [databases, setDatabases] = useState([]);
  const [loadingDbs, setLoadingDbs] = useState(false);
  const [selectedDb, setSelectedDb] = useState('');
  const [tables, setTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedTable, setSelectedTable] = useState('');
  const [tableInfo, setTableInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  // Query state
  const [query, setQuery] = useState('');
  const [queryResults, setQueryResults] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [queryExpanded, setQueryExpanded] = useState(false);
  const queryInputRef = useRef(null);

  // Overlays
  const [showCreds, setShowCreds] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [credentials, setCredentials] = useState([]);
  const [credForm, setCredForm] = useState({ engine: 'mysql', db_user: 'root', db_password: '', auth_method: 'password' });
  const [savingCreds, setSavingCreds] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => { api.getServers().then(setServers).catch(() => {}); }, []);

  // Detect engines on server change
  const detectEngines = useCallback(async (serverId) => {
    if (!serverId) return;
    setDetecting(true);
    setEngines([]); setActiveEngine(''); setDatabases([]); setTables([]);
    setSelectedDb(''); setSelectedTable(''); setTableInfo(null); setQueryResults(null);
    try {
      const [detectData, credsData] = await Promise.all([
        api.detectDatabases(serverId),
        api.getDbCredentials(serverId),
      ]);
      setEngines(detectData.engines);
      setCredentials(credsData);
      if (detectData.engines.length > 0) {
        setActiveEngine(detectData.engines[0]);
      }
      if (detectData.engines.length === 0) toast('No database engines detected', { icon: '!' });
    } catch (err) { toast.error(err.message); }
    setDetecting(false);
  }, []);

  useEffect(() => { if (selectedServer) detectEngines(selectedServer); }, [selectedServer, detectEngines]);

  // Load databases when engine tab changes
  useEffect(() => {
    if (!selectedServer || !activeEngine) return;
    setDatabases([]); setTables([]); setSelectedDb(''); setSelectedTable('');
    setTableInfo(null); setQueryResults(null);
    setLoadingDbs(true);
    api.listDatabases(selectedServer, activeEngine)
      .then(data => setDatabases(data.databases))
      .catch(err => {
        if (err.message?.includes('Access denied') || err.message?.includes('authentication')) {
          setCredForm(prev => ({ ...prev, engine: activeEngine }));
          setShowCreds(true);
          toast.error(`${ENGINE_LABELS[activeEngine]} requires credentials`);
        } else {
          toast.error(err.message);
        }
      })
      .finally(() => setLoadingDbs(false));
  }, [selectedServer, activeEngine]);

  // Load tables when database selected
  useEffect(() => {
    if (!selectedServer || !activeEngine || !selectedDb) return;
    setTables([]); setSelectedTable(''); setTableInfo(null);
    setLoadingTables(true);
    api.listTables(selectedServer, activeEngine, selectedDb)
      .then(data => setTables(data.tables))
      .catch(err => toast.error(err.message))
      .finally(() => setLoadingTables(false));
  }, [selectedServer, activeEngine, selectedDb]);

  // Load table info when table selected
  useEffect(() => {
    if (!selectedServer || !activeEngine || !selectedDb || !selectedTable) return;
    setTableInfo(null); setLoadingInfo(true);
    api.getTableInfo(selectedServer, activeEngine, selectedDb, selectedTable)
      .then(setTableInfo)
      .catch(err => toast.error(err.message))
      .finally(() => setLoadingInfo(false));
    // Set default query
    if (activeEngine === 'mongodb') {
      setQuery(`db.${selectedTable}.find().limit(50)`);
    } else {
      setQuery(`SELECT * FROM ${selectedTable} LIMIT 50;`);
    }
  }, [selectedServer, activeEngine, selectedDb, selectedTable]);

  const runQuery = async () => {
    if (!selectedDb || !query.trim()) return;
    setExecuting(true); setQueryResults(null); setQueryExpanded(true);
    try {
      const data = await api.executeQuery(selectedServer, activeEngine, selectedDb, query);
      setQueryResults(data);
    } catch (err) { toast.error(err.message); }
    setExecuting(false);
  };

  // Credentials
  const saveCreds = async () => {
    if (!selectedServer) return;
    setSavingCreds(true);
    try {
      await api.saveDbCredentials(selectedServer, credForm);
      toast.success('Credentials saved');
      const credsData = await api.getDbCredentials(selectedServer);
      setCredentials(credsData);
      setShowCreds(false);
      // Retry loading databases
      setLoadingDbs(true);
      api.listDatabases(selectedServer, credForm.engine)
        .then(data => setDatabases(data.databases))
        .catch(err => toast.error(err.message))
        .finally(() => setLoadingDbs(false));
    } catch (err) { toast.error(err.message); }
    setSavingCreds(false);
  };

  const deleteCreds = async (engine) => {
    try {
      await api.deleteDbCredentials(selectedServer, engine);
      setCredentials(prev => prev.filter(c => c.engine !== engine));
      toast.success('Credentials removed');
    } catch (err) { toast.error(err.message); }
  };

  // History
  const toggleHistory = async () => {
    setShowHistory(!showHistory);
    if (!showHistory) {
      try { setHistory(await api.getQueryHistory()); } catch {}
    }
  };

  const ec = ENGINE_COLORS[activeEngine] || ENGINE_COLORS.mysql;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-8 bg-bg-sidebar border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Database size={18} className="text-accent-green" />
          <h1 className="font-['Space_Grotesk'] text-lg font-bold text-white">Databases</h1>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedServer} onChange={e => setSelectedServer(e.target.value)}
            className="bg-bg-input border border-border text-text-light font-['JetBrains_Mono'] text-xs px-3 py-1.5 outline-none">
            <option value="">Select server...</option>
            {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {selectedServer && (
            <button onClick={() => {
              if (!showCreds) {
                // Pre-fill form with existing credentials for active engine
                const existing = credentials.find(c => c.engine === (activeEngine || 'mysql'));
                if (existing) {
                  setCredForm({ engine: existing.engine, db_user: existing.db_user, db_password: existing.db_password || '', auth_method: existing.auth_method });
                } else {
                  setCredForm({ engine: activeEngine || 'mysql', db_user: 'root', db_password: '', auth_method: 'password' });
                }
              }
              setShowCreds(!showCreds);
            }}
              className={`flex items-center gap-1.5 px-3 py-1.5 border font-['JetBrains_Mono'] text-[10px] font-semibold tracking-[0.5px] uppercase transition-colors ${
                showCreds ? 'border-accent-blue/30 bg-accent-blue/10 text-accent-blue' : 'border-border text-text-muted hover:text-text-light'}`}>
              <Key size={12} /> Credentials
            </button>
          )}
          <button onClick={toggleHistory}
            className={`flex items-center gap-1.5 px-3 py-1.5 border font-['JetBrains_Mono'] text-[10px] font-semibold tracking-[0.5px] uppercase transition-colors ${
              showHistory ? 'border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow' : 'border-border text-text-muted hover:text-text-light'}`}>
            <Clock size={12} /> History
          </button>
        </div>
      </div>

      {/* Engine Tabs */}
      {engines.length > 0 && (
        <div className="flex items-center gap-0 border-b border-border bg-bg-sidebar shrink-0 px-8">
          {engines.map(engine => {
            const c = ENGINE_COLORS[engine];
            const active = activeEngine === engine;
            const hasCreds = credentials.some(cr => cr.engine === engine);
            return (
              <button key={engine} onClick={() => setActiveEngine(engine)}
                className={`flex items-center gap-2 px-5 py-2.5 font-['JetBrains_Mono'] text-[11px] font-semibold tracking-[0.5px] uppercase border-b-2 transition-colors ${
                  active ? `${c.text} border-current` : 'text-text-dim border-transparent hover:text-text-muted'}`}>
                {ENGINE_LABELS[engine]}
                {hasCreds && <Key size={9} className={active ? c.text : 'text-text-dark'} />}
              </button>
            );
          })}
        </div>
      )}

      {/* Overlay: Credentials */}
      {showCreds && (
        <div className="border-b border-border bg-bg-card px-8 py-5 shrink-0 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px]">// DB_CREDENTIALS</span>
            <button onClick={() => setShowCreds(false)} className="text-text-dim hover:text-text-light"><X size={14} /></button>
          </div>
          {credentials.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {credentials.map(c => (
                <div key={c.id} className="flex items-center gap-2 bg-bg-alt border border-border px-3 py-1.5">
                  <Key size={10} className="text-accent-blue" />
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-light">{ENGINE_LABELS[c.engine]}</span>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim">{c.auth_method === 'sudo' ? 'sudo' : c.db_user}</span>
                  <button onClick={() => deleteCreds(c.engine)} className="text-text-dark hover:text-accent-red"><X size={10} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-3">
            <div>
              <label className="font-['JetBrains_Mono'] text-[9px] text-text-dark tracking-[1px] uppercase block mb-1">Engine</label>
              <select value={credForm.engine} onChange={e => {
                  const eng = e.target.value;
                  const existing = credentials.find(c => c.engine === eng);
                  if (existing) {
                    setCredForm({ engine: eng, db_user: existing.db_user, db_password: existing.db_password || '', auth_method: existing.auth_method });
                  } else {
                    setCredForm(p => ({ ...p, engine: eng, db_user: 'root', db_password: '', auth_method: 'password' }));
                  }
                }}
                className="bg-bg-input border border-border text-text-light font-['JetBrains_Mono'] text-xs px-3 py-1.5 outline-none">
                {engines.map(e => <option key={e} value={e}>{ENGINE_LABELS[e]}</option>)}
              </select>
            </div>
            <div>
              <label className="font-['JetBrains_Mono'] text-[9px] text-text-dark tracking-[1px] uppercase block mb-1">Method</label>
              <select value={credForm.auth_method} onChange={e => setCredForm(p => ({ ...p, auth_method: e.target.value }))}
                className="bg-bg-input border border-border text-text-light font-['JetBrains_Mono'] text-xs px-3 py-1.5 outline-none">
                <option value="password">Password</option>
                <option value="sudo">Sudo</option>
              </select>
            </div>
            {credForm.auth_method === 'password' && (
              <>
                <div>
                  <label className="font-['JetBrains_Mono'] text-[9px] text-text-dark tracking-[1px] uppercase block mb-1">User</label>
                  <input type="text" value={credForm.db_user} onChange={e => setCredForm(p => ({ ...p, db_user: e.target.value }))}
                    placeholder="root" className="bg-bg-input border border-border text-text-light font-['JetBrains_Mono'] text-xs px-3 py-1.5 outline-none w-32 placeholder:text-text-dark" />
                </div>
                <div>
                  <label className="font-['JetBrains_Mono'] text-[9px] text-text-dark tracking-[1px] uppercase block mb-1">Password</label>
                  <input type="password" value={credForm.db_password} onChange={e => setCredForm(p => ({ ...p, db_password: e.target.value }))}
                    placeholder="••••••" className="bg-bg-input border border-border text-text-light font-['JetBrains_Mono'] text-xs px-3 py-1.5 outline-none w-40 placeholder:text-text-dark" />
                </div>
              </>
            )}
            <button onClick={saveCreds} disabled={savingCreds}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-accent-green/10 border border-accent-green/30 text-accent-green font-['JetBrains_Mono'] text-[10px] font-semibold tracking-[0.5px] uppercase hover:bg-accent-green/20 transition-colors disabled:opacity-40">
              <Save size={12} /> {savingCreds ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {showHistory ? (
        <div className="flex-1 overflow-auto p-6 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted tracking-[0.5px]">// QUERY_HISTORY</span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-accent-yellow bg-accent-yellow/10 px-2 py-0.5 border border-accent-yellow/20">{history.length}</span>
          </div>
          {history.length === 0 ? (
            <p className="font-['JetBrains_Mono'] text-[10px] text-text-dim py-8 text-center">No query history yet</p>
          ) : history.map(item => (
            <div key={item.id} className="bg-bg-card border border-border p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-['JetBrains_Mono'] text-[10px] text-accent-green">{item.server_name}</span>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dark">|</span>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim">{item.engine}/{item.database_name}</span>
                </div>
                <button onClick={() => {
                  setSelectedServer(String(item.server_id));
                  setActiveEngine(item.engine);
                  setSelectedDb(item.database_name);
                  setQuery(item.query);
                  setShowHistory(false);
                }} className="text-left w-full">
                  <code className="font-['JetBrains_Mono'] text-xs text-text-light block truncate">{item.query}</code>
                </button>
                <span className="font-['JetBrains_Mono'] text-[9px] text-text-dark mt-1 block">{new Date(item.executed_at + 'Z').toLocaleString()}</span>
              </div>
              <button onClick={async () => { await api.deleteQueryHistory(item.id); setHistory(prev => prev.filter(h => h.id !== item.id)); }}
                className="text-text-dark hover:text-accent-red transition-colors p-1 shrink-0"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      ) : !selectedServer ? (
        <div className="flex-1 flex flex-col items-center justify-center text-text-dim">
          <Database size={40} className="mb-3 opacity-20" />
          <p className="font-['JetBrains_Mono'] text-xs">Select a server to explore databases</p>
        </div>
      ) : detecting ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="text-accent-green animate-spin" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 3-Panel Browser */}
          <div className="flex flex-1 overflow-hidden">
            {/* Panel 1: Databases */}
            <div className="w-[180px] min-w-[180px] border-r border-border flex flex-col overflow-hidden bg-bg-card">
              <div className="px-3 py-2 border-b border-border bg-bg-alt">
                <span className="font-['JetBrains_Mono'] text-[9px] font-semibold text-text-dark tracking-[1.5px] uppercase">Databases</span>
                {databases.length > 0 && <span className="font-['JetBrains_Mono'] text-[9px] text-text-dark ml-1">({databases.length})</span>}
              </div>
              <div className="flex-1 overflow-auto">
                {loadingDbs ? (
                  <div className="flex items-center justify-center py-6"><Loader2 size={14} className="text-text-dim animate-spin" /></div>
                ) : databases.length === 0 ? (
                  <p className="px-3 py-4 font-['JetBrains_Mono'] text-[10px] text-text-dim">No databases found</p>
                ) : databases.map(dbname => (
                  <button key={dbname} onClick={() => setSelectedDb(dbname)}
                    className={`w-full text-left px-3 py-2 font-['JetBrains_Mono'] text-[11px] border-b border-border/30 transition-colors truncate ${
                      selectedDb === dbname
                        ? `${ec.bg} ${ec.text} font-bold border-l-2 ${ec.border}`
                        : 'text-text-muted hover:text-text-light hover:bg-white/[0.02]'}`}>
                    {dbname}
                  </button>
                ))}
              </div>
            </div>

            {/* Panel 2: Tables */}
            <div className="w-[180px] min-w-[180px] border-r border-border flex flex-col overflow-hidden bg-bg-card">
              <div className="px-3 py-2 border-b border-border bg-bg-alt">
                <span className="font-['JetBrains_Mono'] text-[9px] font-semibold text-text-dark tracking-[1.5px] uppercase">Tables</span>
                {tables.length > 0 && <span className="font-['JetBrains_Mono'] text-[9px] text-text-dark ml-1">({tables.length})</span>}
              </div>
              <div className="flex-1 overflow-auto">
                {!selectedDb ? (
                  <p className="px-3 py-4 font-['JetBrains_Mono'] text-[10px] text-text-dim">Select a database</p>
                ) : loadingTables ? (
                  <div className="flex items-center justify-center py-6"><Loader2 size={14} className="text-text-dim animate-spin" /></div>
                ) : tables.length === 0 ? (
                  <p className="px-3 py-4 font-['JetBrains_Mono'] text-[10px] text-text-dim">No tables</p>
                ) : tables.map(t => (
                  <button key={t} onClick={() => setSelectedTable(t)}
                    className={`w-full text-left px-3 py-2 font-['JetBrains_Mono'] text-[11px] border-b border-border/30 transition-colors truncate flex items-center gap-2 ${
                      selectedTable === t
                        ? `${ec.bg} ${ec.text} font-bold border-l-2 ${ec.border}`
                        : 'text-text-muted hover:text-text-light hover:bg-white/[0.02]'}`}>
                    <Table2 size={10} className="shrink-0 opacity-50" />
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Panel 3: Table Content / Preview */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {!selectedTable ? (
                <div className="flex-1 flex flex-col items-center justify-center text-text-dim">
                  <Columns3 size={32} className="mb-3 opacity-20" />
                  <p className="font-['JetBrains_Mono'] text-xs">{selectedDb ? 'Select a table to preview' : 'Select a database and table'}</p>
                </div>
              ) : loadingInfo ? (
                <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="text-accent-green animate-spin" /></div>
              ) : tableInfo ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Table header info */}
                  <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-bg-alt shrink-0">
                    <div className="flex items-center gap-2">
                      <Table2 size={14} className={ec.text} />
                      <span className="font-['JetBrains_Mono'] text-xs font-bold text-white">{selectedTable}</span>
                    </div>
                    <span className={`font-['JetBrains_Mono'] text-[10px] ${ec.text} ${ec.bg} px-2 py-0.5 border ${ec.border}`}>
                      {tableInfo.columns.length} columns
                    </span>
                    <span className="font-['JetBrains_Mono'] text-[10px] text-accent-yellow bg-accent-yellow/10 px-2 py-0.5 border border-accent-yellow/20">
                      {tableInfo.rowCount.toLocaleString()} rows
                    </span>
                  </div>

                  {/* Column definitions */}
                  <div className="border-b border-border shrink-0">
                    <div className="px-4 py-1.5 bg-bg-sidebar">
                      <span className="font-['JetBrains_Mono'] text-[9px] font-semibold text-text-dark tracking-[1.5px] uppercase">Structure</span>
                    </div>
                    <div className="overflow-auto max-h-32">
                      <div className="flex flex-wrap gap-1.5 px-4 py-2">
                        {tableInfo.columns.map((col, i) => (
                          <span key={i} className="inline-flex items-center gap-1 bg-bg-alt border border-border px-2 py-0.5 font-['JetBrains_Mono'] text-[10px]">
                            <span className="text-text-light">{col.name}</span>
                            <span className="text-text-dark">{col.type}</span>
                            {col.key === 'PRI' && <span className="text-accent-yellow text-[8px]">PK</span>}
                            {col.key === 'MUL' && <span className="text-accent-blue text-[8px]">FK</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Data preview */}
                  <div className="flex-1 overflow-auto">
                    <div className="px-4 py-1.5 bg-bg-sidebar border-b border-border sticky top-0">
                      <span className="font-['JetBrains_Mono'] text-[9px] font-semibold text-text-dark tracking-[1.5px] uppercase">Preview (top 20)</span>
                    </div>
                    {tableInfo.preview.rows.length > 0 ? (
                      <div className="overflow-auto">
                        <table className="w-full text-left">
                          <thead className="sticky top-7 bg-bg-sidebar z-10">
                            <tr>
                              {tableInfo.preview.columns.map((col, i) => (
                                <th key={i} className="px-3 py-1.5 font-['JetBrains_Mono'] text-[9px] font-semibold text-text-dim tracking-[1px] uppercase border-b border-border whitespace-nowrap">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tableInfo.preview.rows.map((row, ri) => (
                              <tr key={ri} className={ri % 2 === 0 ? 'bg-bg-card' : 'bg-bg-alt'}>
                                {row.map((cell, ci) => (
                                  <td key={ci} className="px-3 py-1 font-['JetBrains_Mono'] text-[11px] text-text-light whitespace-nowrap border-b border-border/30 max-w-[250px] truncate">
                                    {cell === null || cell === 'NULL' ? <span className="text-text-dark italic">null</span> : cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="px-4 py-6 font-['JetBrains_Mono'] text-[10px] text-text-dim text-center">Empty table</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Query Bar */}
          {selectedDb && (
            <div className="border-t border-border shrink-0 bg-bg-sidebar">
              <div className="flex items-center gap-2 px-4 py-2">
                <span className="font-['JetBrains_Mono'] text-[9px] text-text-dark tracking-[1px] uppercase shrink-0">SQL</span>
                <div className="flex-1 relative">
                  {queryExpanded ? (
                    <textarea
                      ref={queryInputRef}
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runQuery(); }
                        if (e.key === 'Escape') setQueryExpanded(false);
                      }}
                      className="w-full bg-bg-input border border-border text-text-light font-['JetBrains_Mono'] text-xs px-3 py-2 resize-none outline-none h-24"
                      placeholder="Enter query... (Ctrl+Enter to run, Esc to collapse)"
                    />
                  ) : (
                    <input
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onFocus={() => setQueryExpanded(true)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runQuery(); } }}
                      className="w-full bg-bg-input border border-border text-text-light font-['JetBrains_Mono'] text-xs px-3 py-2 outline-none"
                      placeholder={`Query ${selectedDb}...`}
                    />
                  )}
                </div>
                <button onClick={runQuery} disabled={!query.trim() || executing}
                  className="flex items-center gap-1.5 px-4 py-2 bg-accent-green/10 border border-accent-green/30 text-accent-green font-['JetBrains_Mono'] text-[10px] font-semibold tracking-[0.5px] uppercase hover:bg-accent-green/20 transition-colors disabled:opacity-40 shrink-0">
                  {executing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  Run
                </button>
              </div>

              {/* Query Results */}
              {queryResults && (
                <div className="border-t border-border max-h-64 overflow-auto">
                  <div className="flex items-center justify-between px-4 py-1.5 bg-bg-alt border-b border-border sticky top-0">
                    <span className="font-['JetBrains_Mono'] text-[9px] font-semibold text-text-dark tracking-[1.5px] uppercase">Results</span>
                    <div className="flex items-center gap-2">
                      <span className="font-['JetBrains_Mono'] text-[10px] text-accent-green bg-accent-green/10 px-2 py-0.5 border border-accent-green/20">
                        {queryResults.rowCount} row{queryResults.rowCount !== 1 ? 's' : ''}
                      </span>
                      <button onClick={() => setQueryResults(null)} className="text-text-dark hover:text-text-muted"><X size={12} /></button>
                    </div>
                  </div>
                  {queryResults.raw && activeEngine === 'mongodb' ? (
                    <pre className="p-4 font-['JetBrains_Mono'] text-xs text-text-light whitespace-pre-wrap">{queryResults.raw}</pre>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="sticky top-7 bg-bg-sidebar">
                        <tr>
                          {queryResults.columns.map((col, i) => (
                            <th key={i} className="px-3 py-1.5 font-['JetBrains_Mono'] text-[9px] font-semibold text-text-dim tracking-[1px] uppercase border-b border-border whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {queryResults.rows.map((row, ri) => (
                          <tr key={ri} className={ri % 2 === 0 ? 'bg-bg-card' : 'bg-bg-alt'}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-1 font-['JetBrains_Mono'] text-[11px] text-text-light whitespace-nowrap border-b border-border/30 max-w-[250px] truncate">
                                {cell === null || cell === 'NULL' ? <span className="text-text-dark italic">null</span> : cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
