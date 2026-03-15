const express = require('express');
const { db } = require('../db/database');
const { execCommand } = require('../services/ssh');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// List command sets for a project
router.get('/project/:projectId', (req, res) => {
  const sets = db.prepare('SELECT * FROM command_sets WHERE project_id = ? ORDER BY created_at ASC').all(req.params.projectId);
  sets.forEach(s => { s.commands = JSON.parse(s.commands); });
  res.json(sets);
});

// Create command set
router.post('/', (req, res) => {
  const { project_id, name, commands, color } = req.body;
  if (!project_id || !name || !commands || !commands.length) {
    return res.status(400).json({ error: 'project_id, name, and commands are required' });
  }
  const result = db.prepare(
    'INSERT INTO command_sets (project_id, name, commands, color) VALUES (?, ?, ?, ?)'
  ).run(project_id, name, JSON.stringify(commands), color || 'green');
  const set = db.prepare('SELECT * FROM command_sets WHERE id = ?').get(result.lastInsertRowid);
  set.commands = JSON.parse(set.commands);
  res.status(201).json(set);
});

// Update command set
router.put('/:id', (req, res) => {
  const { name, commands, color } = req.body;
  db.prepare('UPDATE command_sets SET name = ?, commands = ?, color = ? WHERE id = ?')
    .run(name, JSON.stringify(commands), color || 'green', req.params.id);
  const set = db.prepare('SELECT * FROM command_sets WHERE id = ?').get(req.params.id);
  set.commands = JSON.parse(set.commands);
  res.json(set);
});

// Delete command set
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM command_sets WHERE id = ?').run(req.params.id);
  res.json({ message: 'Command set deleted' });
});

// Run a command set
router.post('/:id/run', async (req, res) => {
  const set = db.prepare('SELECT * FROM command_sets WHERE id = ?').get(req.params.id);
  if (!set) return res.status(404).json({ error: 'Command set not found' });

  const commands = JSON.parse(set.commands);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(set.project_id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(project.server_id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  // Create a deploy log entry for tracking
  const log = db.prepare(
    'INSERT INTO deploy_logs (project_id, action, output, status) VALUES (?, ?, ?, ?)'
  ).run(project.id, set.name, '', 'running');
  const logId = log.lastInsertRowid;

  db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('running_commands', project.id);
  res.json({ message: `Running "${set.name}"`, projectId: project.id, logId });

  // Run async
  const io = req.app.get('io');
  let fullOutput = '';

  const emit = (type, data) => {
    fullOutput += data;
    io.to(`project:${project.id}`).emit('deploy:output', {
      logId, projectId: project.id, type, data, action: set.name,
    });
  };

  try {
    emit('info', `--- Running "${set.name}" ---\n`);

    for (const command of commands) {
      emit('info', `\n>> ${command}\n`);
      const result = await execCommand(server, command, project.path,
        (data) => emit('stdout', data), (data) => emit('stderr', data));
      if (result.code !== 0 && result.code !== null) {
        emit('error', `\nCommand failed with code ${result.code}\n`);
        db.prepare('UPDATE deploy_logs SET output = ?, status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(fullOutput, 'failed', logId);
        db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('failed', project.id);
        return;
      }
    }

    emit('info', `\n--- "${set.name}" completed successfully ---\n`);
    db.prepare('UPDATE deploy_logs SET output = ?, status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(fullOutput, 'success', logId);
    db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('running', project.id);
  } catch (err) {
    emit('error', `\nError: ${err.message}\n`);
    db.prepare('UPDATE deploy_logs SET output = ?, status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(fullOutput, 'failed', logId);
    db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('failed', project.id);
  }
});

module.exports = router;
