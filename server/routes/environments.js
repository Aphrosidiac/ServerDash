const express = require('express');
const { db } = require('../db/database');
const { deployEnvironment, rollbackEnvironment } = require('../services/deploy');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// List environments for a project
router.get('/project/:projectId', (req, res) => {
  const envs = db.prepare(`
    SELECT e.*, s.name as server_name, s.host as server_host
    FROM environments e
    JOIN servers s ON e.server_id = s.id
    WHERE e.project_id = ?
    ORDER BY e.deploy_order ASC
  `).all(req.params.projectId);
  res.json(envs);
});

// Create environment
router.post('/', (req, res) => {
  const { project_id, name, server_id, branch, path, build_command, restart_command, auto_deploy, deploy_order } = req.body;
  if (!project_id || !name || !server_id || !path) {
    return res.status(400).json({ error: 'Missing required fields: project_id, name, server_id, path' });
  }

  const result = db.prepare(
    `INSERT INTO environments (project_id, name, server_id, branch, path, build_command, restart_command, auto_deploy, deploy_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(project_id, name, server_id, branch || 'main', path, build_command || null, restart_command || null, auto_deploy ? 1 : 0, deploy_order || 0);

  const env = db.prepare(`
    SELECT e.*, s.name as server_name, s.host as server_host
    FROM environments e
    JOIN servers s ON e.server_id = s.id
    WHERE e.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(env);
});

// Update environment
router.put('/:id', (req, res) => {
  const { name, server_id, branch, path, build_command, restart_command, auto_deploy, deploy_order } = req.body;
  db.prepare(
    `UPDATE environments SET name = ?, server_id = ?, branch = ?, path = ?, build_command = ?, restart_command = ?, auto_deploy = ?, deploy_order = ?
     WHERE id = ?`
  ).run(name, server_id, branch || 'main', path, build_command || null, restart_command || null, auto_deploy ? 1 : 0, deploy_order || 0, req.params.id);

  const env = db.prepare(`
    SELECT e.*, s.name as server_name, s.host as server_host
    FROM environments e
    JOIN servers s ON e.server_id = s.id
    WHERE e.id = ?
  `).get(req.params.id);
  res.json(env);
});

// Delete environment
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM environments WHERE id = ?').run(req.params.id);
  res.json({ message: 'Environment deleted' });
});

// Deploy to a specific environment
router.post('/:id/deploy', async (req, res) => {
  const env = db.prepare('SELECT * FROM environments WHERE id = ?').get(req.params.id);
  if (!env) return res.status(404).json({ error: 'Environment not found' });

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(env.server_id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(env.project_id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  db.prepare('UPDATE environments SET status = ? WHERE id = ?').run('deploying', env.id);
  res.json({ message: 'Deployment started', environmentId: env.id, projectId: env.project_id });

  const io = req.app.get('io');
  deployEnvironment(env, server, project, io);
});

// Promote: deploy the last_commit from this env to the next env in order
router.post('/:id/promote', async (req, res) => {
  const env = db.prepare('SELECT * FROM environments WHERE id = ?').get(req.params.id);
  if (!env) return res.status(404).json({ error: 'Environment not found' });

  if (!env.last_commit) {
    return res.status(400).json({ error: 'No deployment to promote — deploy to this environment first' });
  }

  // Find the next environment in the pipeline
  const nextEnv = db.prepare(
    'SELECT * FROM environments WHERE project_id = ? AND deploy_order > ? ORDER BY deploy_order ASC LIMIT 1'
  ).get(env.project_id, env.deploy_order);

  if (!nextEnv) {
    return res.status(400).json({ error: 'No next environment to promote to — this is the last stage' });
  }

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(nextEnv.server_id);
  if (!server) return res.status(404).json({ error: 'Target server not found' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(env.project_id);

  db.prepare('UPDATE environments SET status = ? WHERE id = ?').run('deploying', nextEnv.id);
  res.json({ message: `Promoting to ${nextEnv.name}`, fromEnv: env.name, toEnv: nextEnv.name, commit: env.last_commit });

  const io = req.app.get('io');
  deployEnvironment(nextEnv, server, project, io, env.last_commit);
});

// Rollback to the previous successful deploy
router.post('/:id/rollback', async (req, res) => {
  const env = db.prepare('SELECT * FROM environments WHERE id = ?').get(req.params.id);
  if (!env) return res.status(404).json({ error: 'Environment not found' });

  // Find the last successful deploy log with a different commit
  const lastGood = db.prepare(`
    SELECT commit_hash FROM deploy_logs
    WHERE environment_id = ? AND status = 'success' AND commit_hash IS NOT NULL AND commit_hash != ?
    ORDER BY started_at DESC LIMIT 1
  `).get(env.id, env.last_commit || '');

  if (!lastGood) {
    return res.status(400).json({ error: 'No previous successful deployment to rollback to' });
  }

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(env.server_id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(env.project_id);

  db.prepare('UPDATE environments SET status = ? WHERE id = ?').run('rolling_back', env.id);
  res.json({ message: `Rolling back to ${lastGood.commit_hash.substring(0, 7)}`, commit: lastGood.commit_hash });

  const io = req.app.get('io');
  rollbackEnvironment(env, server, project, io, lastGood.commit_hash);
});

// Get deploy logs for an environment
router.get('/:id/logs', (req, res) => {
  const logs = db.prepare(
    'SELECT * FROM deploy_logs WHERE environment_id = ? ORDER BY started_at DESC LIMIT 20'
  ).all(req.params.id);
  res.json(logs);
});

module.exports = router;
