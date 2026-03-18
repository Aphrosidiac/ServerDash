import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { BarChart3, RefreshCw, Activity, HardDrive, Cpu, MemoryStick } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import toast from 'react-hot-toast';

const RANGES = ['1h', '6h', '24h', '7d'];
const CHART_COLORS = { cpu: '#3B82F6', ram: '#00FF88', disk: '#FF6B35', netRx: '#00FF88', netTx: '#3B82F6' };
const GRID_COLOR = '#2f2f2f';
const TEXT_COLOR = '#8a8a8a';

const tickStyle = { fill: TEXT_COLOR, fontSize: 10, fontFamily: 'JetBrains Mono' };

function formatTime(ts) {
  const d = new Date(ts + 'Z');
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function ChartCard({ title, icon: Icon, color, children }) {
  return (
    <div className="bg-bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase">{title}</span>
        <Icon size={16} className={color} />
      </div>
      <div className="h-[220px]">
        {children}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-sidebar border border-border px-3 py-2 font-['JetBrains_Mono'] text-[10px]">
      <p className="text-text-muted mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}{p.unit || '%'}</p>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState('');
  const [range, setRange] = useState('24h');
  const [metrics, setMetrics] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadServers = useCallback(async () => {
    try {
      const data = await api.getServers();
      setServers(data);
      if (data.length > 0 && !selectedServer) setSelectedServer(String(data[0].id));
    } catch (err) { toast.error(err.message); }
  }, []);

  const loadMetrics = useCallback(async () => {
    if (!selectedServer) return;
    setLoading(true);
    try {
      const [metricsData, summaryData] = await Promise.all([
        api.getServerMetrics(selectedServer, range),
        api.getMetricsSummary(),
      ]);
      setMetrics(metricsData.map(m => ({
        ...m,
        time: formatTime(m.recorded_at),
      })));
      setSummary(summaryData);
    } catch (err) { toast.error(err.message); }
    setLoading(false);
  }, [selectedServer, range]);

  useEffect(() => { loadServers(); }, [loadServers]);
  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  const handleCollect = async () => {
    try {
      await api.triggerMetricsCollection();
      toast.success('Metrics collected');
      loadMetrics();
    } catch (err) { toast.error(err.message); }
  };

  const serverSummary = summary.find(s => String(s.server_id) === selectedServer);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-8 bg-bg-sidebar border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <BarChart3 size={18} className="text-accent-green" />
          <h1 className="font-['Space_Grotesk'] text-lg font-bold text-white">Analytics</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Server selector */}
          <select
            value={selectedServer}
            onChange={e => setSelectedServer(e.target.value)}
            className="bg-bg-input border border-border text-text-light font-['JetBrains_Mono'] text-xs px-3 py-1.5 outline-none"
          >
            {servers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Range selector */}
          <div className="flex border border-border">
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 font-['JetBrains_Mono'] text-[10px] font-semibold tracking-[0.5px] uppercase transition-colors ${
                  range === r
                    ? 'bg-accent-green/10 text-accent-green border-r border-accent-green/20'
                    : 'text-text-muted hover:text-text-light border-r border-border last:border-r-0'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button onClick={handleCollect} className="text-text-muted hover:text-accent-green transition-colors p-1.5" title="Collect now">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8 space-y-6">
        {/* Summary cards */}
        {serverSummary && (
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Avg CPU', value: `${serverSummary.avg_cpu}%`, icon: Cpu, color: 'text-accent-blue' },
              { label: 'Avg RAM', value: `${serverSummary.avg_ram}%`, icon: MemoryStick, color: 'text-accent-green' },
              { label: 'Avg Disk', value: `${serverSummary.avg_disk}%`, icon: HardDrive, color: 'text-accent-orange' },
              { label: 'Snapshots', value: serverSummary.snapshot_count, icon: Activity, color: 'text-accent-yellow' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-bg-card border border-border p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-text-muted tracking-[1.5px] uppercase">{label}</span>
                  <Icon size={16} className={color} />
                </div>
                <span className="font-['Space_Grotesk'] text-3xl font-bold text-white">{value}</span>
                <p className="font-['JetBrains_Mono'] text-[10px] text-text-dim mt-1">last 24h average</p>
              </div>
            ))}
          </div>
        )}

        {/* Charts */}
        {metrics.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-text-dim font-['JetBrains_Mono'] text-xs">
            {loading ? 'Loading metrics...' : 'No metrics data yet. Metrics are collected every 5 minutes.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* CPU */}
            <ChartCard title="CPU Usage" icon={Cpu} color="text-accent-blue">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics}>
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={tickStyle} />
                  <YAxis tick={tickStyle} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="cpu_percent" name="CPU" stroke={CHART_COLORS.cpu} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* RAM */}
            <ChartCard title="Memory Usage" icon={MemoryStick} color="text-accent-green">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics}>
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={tickStyle} />
                  <YAxis tick={tickStyle} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="ram_percent" name="RAM" stroke={CHART_COLORS.ram} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Disk */}
            <ChartCard title="Disk Usage" icon={HardDrive} color="text-accent-orange">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics}>
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={tickStyle} />
                  <YAxis tick={tickStyle} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="disk_percent" name="Disk" stroke={CHART_COLORS.disk} fill={CHART_COLORS.disk} fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Network */}
            <ChartCard title="Network I/O" icon={Activity} color="text-accent-green">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics}>
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={tickStyle} />
                  <YAxis tick={tickStyle} tickFormatter={v => formatBytes(v)} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-bg-sidebar border border-border px-3 py-2 font-['JetBrains_Mono'] text-[10px]">
                        <p className="text-text-muted mb-1">{label}</p>
                        {payload.map((p, i) => (
                          <p key={i} style={{ color: p.color }}>{p.name}: {formatBytes(p.value)}</p>
                        ))}
                      </div>
                    );
                  }} />
                  <Area type="monotone" dataKey="net_in" name="RX" stroke={CHART_COLORS.netRx} fill={CHART_COLORS.netRx} fillOpacity={0.1} strokeWidth={2} />
                  <Area type="monotone" dataKey="net_out" name="TX" stroke={CHART_COLORS.netTx} fill={CHART_COLORS.netTx} fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}
      </div>
    </div>
  );
}
