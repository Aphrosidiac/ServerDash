const express = require('express');
const crypto = require('crypto');
const { db } = require('../db/database');
const { deployEnvironment } = require('../services/deploy');

const router = express.Router();

// GitHub webhook — no auth middleware, uses webhook_secret instead
router.post('/github', express.raw({ type: 'application/json' }), (req, res) => {
  const event = req.headers['x-github-event'];
  if (event !== 'push') {
    return res.json({ message: `Ignored event: ${event}` });
  }

  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const branch = (payload.ref || '').replace('refs/heads/', '');
  const repoUrl = payload.repository?.html_url || payload.repository?.clone_url || '';
  const signature = req.headers['x-hub-signature-256'];

  // Find all environments that auto-deploy on this branch
  const envs = db.prepare(`
    SELECT e.*, p.webhook_secret, p.name as project_name, p.repo_url
    FROM environments e
    JOIN projects p ON e.project_id = p.id
    WHERE e.branch = ? AND e.auto_deploy = 1
  `).all(branch);

  if (envs.length === 0) {
    return res.json({ message: `No auto-deploy environments for branch: ${branch}` });
  }

  const io = req.app.get('io');
  let triggered = 0;

  for (const env of envs) {
    // Verify webhook secret if configured
    if (env.webhook_secret && signature) {
      const expected = 'sha256=' + crypto.createHmac('sha256', env.webhook_secret)
        .update(typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
        .digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        continue; // Skip this env, signature mismatch
      }
    }

    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(env.server_id);
    if (!server) continue;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(env.project_id);

    db.prepare('UPDATE environments SET status = ? WHERE id = ?').run('deploying', env.id);
    deployEnvironment(env, server, project, io);
    triggered++;
  }

  res.json({ message: `Triggered ${triggered} deployment(s) for branch: ${branch}` });
});

module.exports = router;
