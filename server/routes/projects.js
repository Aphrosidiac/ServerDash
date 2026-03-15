const express = require('express');
const { db } = require('../db/database');
const { execCommand } = require('../services/ssh');
const { deployProject, updateProject } = require('../services/deploy');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, s.name as server_name, s.host as server_host
    FROM projects p
    JOIN servers s ON p.server_id = s.id
    ORDER BY p.created_at DESC
  `).all();
  res.json(projects);
});

router.get('/:id', (req, res) => {
  const project = db.prepare(`
    SELECT p.*, s.name as server_name, s.host as server_host
    FROM projects p
    JOIN servers s ON p.server_id = s.id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.post('/', (req, res) => {
  const { server_id, name, path, repo_url, branch, build_command, start_command, stop_command, restart_command, update_commands } = req.body;
  if (!server_id || !name || !path) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const updateCmds = update_commands ? JSON.stringify(update_commands) : null;

  const result = db.prepare(
    `INSERT INTO projects (server_id, name, path, repo_url, branch, build_command, start_command, stop_command, restart_command, update_commands)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(server_id, name, path, repo_url || null, branch || 'main', build_command || null, start_command || null, stop_command || null, restart_command || null, updateCmds);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(project);
});

router.put('/:id', (req, res) => {
  const { server_id, name, path, repo_url, branch, build_command, start_command, stop_command, restart_command, update_commands } = req.body;
  const updateCmds = update_commands ? JSON.stringify(update_commands) : null;
  db.prepare(
    `UPDATE projects SET server_id = ?, name = ?, path = ?, repo_url = ?, branch = ?, build_command = ?, start_command = ?, stop_command = ?, restart_command = ?, update_commands = ?
     WHERE id = ?`
  ).run(server_id, name, path, repo_url || null, branch || 'main', build_command || null, start_command || null, stop_command || null, restart_command || null, updateCmds, req.params.id);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json(project);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ message: 'Project deleted' });
});

// Deploy a project
router.post('/:id/deploy', async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(project.server_id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('deploying', project.id);

  // Run deployment async, respond immediately
  res.json({ message: 'Deployment started', projectId: project.id });

  const io = req.app.get('io');
  deployProject(project, server, io);
});

// Update a project (run update_commands sequentially)
router.post('/:id/update', async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const commands = JSON.parse(project.update_commands || '[]');
  if (commands.length === 0) {
    return res.status(400).json({ error: 'No update commands configured for this project' });
  }

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(project.server_id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('updating', project.id);

  res.json({ message: 'Update started', projectId: project.id });

  const io = req.app.get('io');
  updateProject(project, server, io);
});

// Run arbitrary command on a project's server
router.post('/:id/exec', async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Command is required' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(project.server_id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  try {
    const result = await execCommand(server, command, project.path);
    res.json({ stdout: result.stdout, stderr: result.stderr, code: result.code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get deploy logs
router.get('/:id/logs', (req, res) => {
  const logs = db.prepare(
    'SELECT * FROM deploy_logs WHERE project_id = ? ORDER BY started_at DESC LIMIT 20'
  ).all(req.params.id);
  res.json(logs);
});

// Check project status via process check
router.post('/:id/status', async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(project.server_id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  try {
    // Check if there's a running process (works for pm2, systemd, or plain node)
    const result = await execCommand(server, `cd ${project.path} && git log --oneline -1`, project.path);
    const status = result.code === 0 ? 'running' : 'stopped';
    db.prepare('UPDATE projects SET status = ? WHERE id = ?').run(status, project.id);
    res.json({ status, lastCommit: result.stdout.trim() });
  } catch (err) {
    res.json({ status: 'unreachable', error: err.message });
  }
});

module.exports = router;
