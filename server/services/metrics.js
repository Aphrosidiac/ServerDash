const { db } = require('../db/database');
const { execCommand } = require('./ssh');

const insertSnapshot = db.prepare(`
  INSERT INTO metric_snapshots (server_id, cpu_percent, ram_percent, disk_percent, net_in, net_out)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const deleteOld = db.prepare(`DELETE FROM metric_snapshots WHERE recorded_at < datetime('now', '-30 days')`);

async function collectMetricsForServer(server) {
  const cmd = [
    'echo "---CPU---"; top -bn1 | grep "Cpu(s)" | head -1',
    'echo "---MEM---"; free -b | grep Mem',
    'echo "---DISK---"; df -B1 --total 2>/dev/null | grep total || df -B1 / | tail -1',
    'echo "---NET---"; cat /proc/net/dev | tail -n +3',
  ].join('; ');

  const result = await execCommand(server, cmd);
  const out = result.stdout;

  const section = (tag) => {
    const re = new RegExp(`---${tag}---\\n([\\s\\S]*?)(?=---[A-Z]|$)`);
    const m = out.match(re);
    return m ? m[1].trim() : '';
  };

  // CPU
  const cpuLine = section('CPU');
  const idle = parseFloat(cpuLine.match(/([\d.]+)\s*id/)?.[1] || '0');
  const cpuUsage = Math.round((100 - idle) * 10) / 10;

  // Memory
  const memParts = section('MEM').split(/\s+/);
  const memTotal = parseInt(memParts[1]) || 1;
  const memUsed = parseInt(memParts[2]) || 0;
  const ramPercent = Math.round((memUsed / memTotal) * 1000) / 10;

  // Disk
  const diskParts = section('DISK').split(/\s+/);
  const diskTotal = parseInt(diskParts[1]) || 1;
  const diskUsed = parseInt(diskParts[2]) || 0;
  const diskPercent = Math.round((diskUsed / diskTotal) * 1000) / 10;

  // Network
  const netLines = section('NET').split('\n').filter(Boolean);
  let netRx = 0, netTx = 0;
  for (const line of netLines) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'lo:') continue;
    netRx += parseInt(p[1]) || 0;
    netTx += parseInt(p[9]) || 0;
  }

  insertSnapshot.run(server.id, cpuUsage, ramPercent, diskPercent, netRx, netTx);
}

async function collectAll() {
  const servers = db.prepare('SELECT * FROM servers').all();
  const results = await Promise.allSettled(
    servers.map(server => collectMetricsForServer(server))
  );
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      console.error(`Metrics error for ${servers[i].name}:`, results[i].reason?.message);
    }
  }
  deleteOld.run();
}

let intervalId = null;

function startMetricsCollector() {
  const ms = parseInt(process.env.METRICS_INTERVAL_MS) || 300000;
  console.log(`Metrics collector started (interval: ${ms / 1000}s)`);
  collectAll().catch(err => console.error('Initial metrics collection error:', err.message));
  intervalId = setInterval(() => {
    collectAll().catch(err => console.error('Metrics collection error:', err.message));
  }, ms);
}

function stopMetricsCollector() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { startMetricsCollector, stopMetricsCollector, collectAll, collectMetricsForServer };
