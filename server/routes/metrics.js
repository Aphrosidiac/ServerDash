const express = require('express');
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { collectAll } = require('../services/metrics');

const router = express.Router();

const RANGE_MAP = {
  '1h': '-1 hour',
  '6h': '-6 hours',
  '24h': '-1 day',
  '7d': '-7 days',
  '30d': '-30 days',
};

// Historical metrics for a server
router.get('/servers/:id/metrics', authMiddleware, (req, res) => {
  const { id } = req.params;
  const range = RANGE_MAP[req.query.range] || RANGE_MAP['24h'];

  const server = db.prepare('SELECT id FROM servers WHERE id = ?').get(id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const snapshots = db.prepare(`
    SELECT cpu_percent, ram_percent, disk_percent, net_in, net_out, recorded_at
    FROM metric_snapshots
    WHERE server_id = ? AND recorded_at >= datetime('now', ?)
    ORDER BY recorded_at ASC
  `).all(id, range);

  res.json(snapshots);
});

// Manual collection trigger
router.post('/metrics/collect', authMiddleware, async (req, res) => {
  try {
    await collectAll();
    res.json({ message: 'Metrics collection completed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Summary: 24h averages per server
router.get('/metrics/summary', authMiddleware, (req, res) => {
  const summary = db.prepare(`
    SELECT
      ms.server_id,
      s.name as server_name,
      ROUND(AVG(ms.cpu_percent), 1) as avg_cpu,
      ROUND(AVG(ms.ram_percent), 1) as avg_ram,
      ROUND(AVG(ms.disk_percent), 1) as avg_disk,
      COUNT(*) as snapshot_count,
      MAX(ms.recorded_at) as last_collected
    FROM metric_snapshots ms
    JOIN servers s ON ms.server_id = s.id
    WHERE ms.recorded_at >= datetime('now', '-1 day')
    GROUP BY ms.server_id
  `).all();

  res.json(summary);
});

module.exports = router;
