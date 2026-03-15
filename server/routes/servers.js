const express = require('express');
const { db } = require('../db/database');
const { testConnection, execCommand } = require('../services/ssh');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const SAFE_FIELDS = 'id, name, host, port, username, auth_type, private_key_path, created_at';

router.get('/', (req, res) => {
  const servers = db.prepare(`SELECT ${SAFE_FIELDS} FROM servers ORDER BY created_at DESC`).all();
  res.json(servers);
});

router.get('/:id', (req, res) => {
  const server = db.prepare(`SELECT ${SAFE_FIELDS} FROM servers WHERE id = ?`).get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  res.json(server);
});

router.post('/', (req, res) => {
  const { name, host, port, username, auth_type, private_key_path, private_key, server_password } = req.body;
  if (!name || !host || !username) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const result = db.prepare(
    'INSERT INTO servers (name, host, port, username, auth_type, private_key_path, private_key, server_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(name, host, port || 22, username, auth_type || 'password', private_key_path || null, private_key || null, server_password || null);

  const server = db.prepare(`SELECT ${SAFE_FIELDS} FROM servers WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(server);
});

router.put('/:id', (req, res) => {
  const { name, host, port, username, auth_type, private_key_path, private_key, server_password } = req.body;
  db.prepare(
    'UPDATE servers SET name = ?, host = ?, port = ?, username = ?, auth_type = ?, private_key_path = ?, private_key = ?, server_password = ? WHERE id = ?'
  ).run(name, host, port || 22, username, auth_type || 'password', private_key_path || null, private_key || null, server_password || null, req.params.id);

  const server = db.prepare(`SELECT ${SAFE_FIELDS} FROM servers WHERE id = ?`).get(req.params.id);
  res.json(server);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.id);
  res.json({ message: 'Server deleted' });
});

router.post('/:id/test', async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const result = await testConnection(server);
  res.json(result);
});

// System stats - single command batch for speed
router.get('/:id/stats', async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  try {
    const cmd = [
      'echo "---HOSTNAME---"; hostname',
      'echo "---OS---"; cat /etc/os-release 2>/dev/null | head -4 || echo "unknown"',
      'echo "---KERNEL---"; uname -r',
      'echo "---UPTIME---"; uptime -p 2>/dev/null || uptime',
      'echo "---LOAD---"; cat /proc/loadavg',
      'echo "---CPU---"; top -bn1 | grep "Cpu(s)" | head -1',
      'echo "---CPUCOUNT---"; nproc',
      'echo "---MEM---"; free -b | grep Mem',
      'echo "---SWAP---"; free -b | grep Swap',
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

    // Parse OS
    const osLines = section('OS');
    const prettyName = osLines.match(/PRETTY_NAME="?([^"\n]+)/)?.[1] || 'Unknown';

    // Parse load
    const loadParts = section('LOAD').split(' ');

    // Parse CPU
    const cpuLine = section('CPU');
    const idle = parseFloat(cpuLine.match(/([\d.]+)\s*id/)?.[1] || '0');
    const cpuUsage = Math.round((100 - idle) * 10) / 10;
    const cpuCount = parseInt(section('CPUCOUNT')) || 1;

    // Parse memory
    const memParts = section('MEM').split(/\s+/);
    const memTotal = parseInt(memParts[1]) || 0;
    const memUsed = parseInt(memParts[2]) || 0;

    // Parse swap
    const swapParts = section('SWAP').split(/\s+/);
    const swapTotal = parseInt(swapParts[1]) || 0;
    const swapUsed = parseInt(swapParts[2]) || 0;

    // Parse disk
    const diskParts = section('DISK').split(/\s+/);
    const diskTotal = parseInt(diskParts[1]) || 0;
    const diskUsed = parseInt(diskParts[2]) || 0;

    // Parse network
    const netLines = section('NET').split('\n').filter(Boolean);
    let netRx = 0, netTx = 0;
    for (const line of netLines) {
      const p = line.trim().split(/\s+/);
      if (p[0] === 'lo:') continue;
      netRx += parseInt(p[1]) || 0;
      netTx += parseInt(p[9]) || 0;
    }

    res.json({
      hostname: section('HOSTNAME'),
      os: prettyName,
      kernel: section('KERNEL'),
      uptime: section('UPTIME'),
      load: loadParts.slice(0, 3).join(' '),
      cpu: { usage: cpuUsage, cores: cpuCount },
      memory: { total: memTotal, used: memUsed },
      swap: { total: swapTotal, used: swapUsed },
      disk: { total: diskTotal, used: diskUsed },
      network: { rx: netRx, tx: netTx },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Top processes
router.get('/:id/processes', async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  try {
    const result = await execCommand(server, 'ps aux --sort=-%cpu | head -16');
    const lines = result.stdout.split('\n').filter(Boolean);
    const processes = lines.slice(1).map((line) => {
      const p = line.split(/\s+/);
      return {
        user: p[0],
        pid: p[1],
        cpu: p[2],
        mem: p[3],
        command: p.slice(10).join(' '),
      };
    });
    res.json(processes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// File browser
router.get('/:id/files', async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const dirPath = req.query.path || '/home';

  try {
    const result = await execCommand(server, `ls -la --time-style=long-iso "${dirPath}" 2>&1`);
    const lines = result.stdout.split('\n').filter(Boolean);
    const files = lines.slice(1).map((line) => {
      const p = line.split(/\s+/);
      if (p.length < 8) return null;
      return {
        permissions: p[0],
        owner: p[2],
        group: p[3],
        size: parseInt(p[4]) || 0,
        date: `${p[5]} ${p[6]}`,
        name: p.slice(7).join(' '),
        isDir: p[0].startsWith('d'),
      };
    }).filter(Boolean).filter(f => f.name !== '.' && f.name !== '..');
    res.json({ path: dirPath, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read file content
router.post('/:id/read', async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'File path is required' });

  try {
    const result = await execCommand(server, `cat "${filePath}"`);
    if (result.stderr && result.code !== 0) {
      return res.status(400).json({ error: result.stderr });
    }
    res.json({ path: filePath, content: result.stdout || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save file content
router.post('/:id/write', async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { path: filePath, content } = req.body;
  if (!filePath) return res.status(400).json({ error: 'File path is required' });
  if (content === undefined) return res.status(400).json({ error: 'Content is required' });

  try {
    const b64 = Buffer.from(content, 'utf8').toString('base64');
    const result = await execCommand(server, `echo '${b64}' | base64 -d > "${filePath}"`);
    if (result.code !== 0) {
      return res.status(400).json({ error: result.stderr || 'Failed to save file' });
    }
    res.json({ message: 'File saved', path: filePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Linked projects for a server
router.get('/:id/projects', async (req, res) => {
  const projects = db.prepare(
    'SELECT * FROM projects WHERE server_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json(projects);
});

// Execute command on server
router.post('/:id/exec', async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Command is required' });

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  try {
    const result = await execCommand(server, command);
    res.json({ stdout: result.stdout, stderr: result.stderr, code: result.code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
