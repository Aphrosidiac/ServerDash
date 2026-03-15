const { execCommand } = require('./ssh');
const { db } = require('../db/database');

async function deployProject(project, server, io) {
  const log = db.prepare(
    'INSERT INTO deploy_logs (project_id, action, output, status) VALUES (?, ?, ?, ?)'
  ).run(project.id, 'deploy', '', 'running');

  const logId = log.lastInsertRowid;
  let fullOutput = '';

  const emit = (type, data) => {
    fullOutput += data;
    io.to(`project:${project.id}`).emit('deploy:output', {
      logId,
      projectId: project.id,
      type,
      data,
    });
  };

  const updateLog = (status) => {
    db.prepare(
      'UPDATE deploy_logs SET output = ?, status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(fullOutput, status, logId);
  };

  try {
    emit('info', `--- Starting deployment for ${project.name} ---\n`);

    // Step 1: Git pull
    emit('info', '\n>> git pull\n');
    const pullResult = await execCommand(
      server,
      `git pull origin ${project.branch}`,
      project.path,
      (data) => emit('stdout', data),
      (data) => emit('stderr', data)
    );
    if (pullResult.code !== 0 && pullResult.code !== null) {
      emit('error', `\nGit pull failed with code ${pullResult.code}\n`);
      updateLog('failed');
      db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('failed', project.id);
      return { success: false };
    }

    // Step 2: Build (if command exists)
    if (project.build_command) {
      emit('info', `\n>> ${project.build_command}\n`);
      const buildResult = await execCommand(
        server,
        project.build_command,
        project.path,
        (data) => emit('stdout', data),
        (data) => emit('stderr', data)
      );
      if (buildResult.code !== 0 && buildResult.code !== null) {
        emit('error', `\nBuild failed with code ${buildResult.code}\n`);
        updateLog('failed');
        db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('failed', project.id);
        return { success: false };
      }
    }

    // Step 3: Restart
    if (project.restart_command) {
      emit('info', `\n>> ${project.restart_command}\n`);
      await execCommand(
        server,
        project.restart_command,
        project.path,
        (data) => emit('stdout', data),
        (data) => emit('stderr', data)
      );
    } else {
      if (project.stop_command) {
        emit('info', `\n>> ${project.stop_command}\n`);
        await execCommand(server, project.stop_command, project.path,
          (data) => emit('stdout', data), (data) => emit('stderr', data));
      }
      if (project.start_command) {
        emit('info', `\n>> ${project.start_command}\n`);
        await execCommand(server, project.start_command, project.path,
          (data) => emit('stdout', data), (data) => emit('stderr', data));
      }
    }

    emit('info', '\n--- Deployment completed successfully ---\n');
    updateLog('success');
    db.prepare(
      'UPDATE projects SET status = ?, last_deployed_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run('running', project.id);

    return { success: true };
  } catch (err) {
    emit('error', `\nDeployment error: ${err.message}\n`);
    updateLog('failed');
    db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('failed', project.id);
    return { success: false, error: err.message };
  }
}

async function updateProject(project, server, io) {
  const commands = JSON.parse(project.update_commands || '[]');
  if (commands.length === 0) {
    return { success: false, error: 'No update commands configured' };
  }

  const log = db.prepare(
    'INSERT INTO deploy_logs (project_id, action, output, status) VALUES (?, ?, ?, ?)'
  ).run(project.id, 'update', '', 'running');

  const logId = log.lastInsertRowid;
  let fullOutput = '';

  const emit = (type, data) => {
    fullOutput += data;
    io.to(`project:${project.id}`).emit('deploy:output', {
      logId,
      projectId: project.id,
      type,
      data,
    });
  };

  const updateLog = (status) => {
    db.prepare(
      'UPDATE deploy_logs SET output = ?, status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(fullOutput, status, logId);
  };

  try {
    emit('info', `--- Starting update for ${project.name} ---\n`);

    for (const command of commands) {
      emit('info', `\n>> ${command}\n`);
      const result = await execCommand(
        server,
        command,
        project.path,
        (data) => emit('stdout', data),
        (data) => emit('stderr', data)
      );
      if (result.code !== 0 && result.code !== null) {
        emit('error', `\nCommand failed with code ${result.code}\n`);
        updateLog('failed');
        db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('failed', project.id);
        return { success: false };
      }
    }

    emit('info', '\n--- Update completed successfully ---\n');
    updateLog('success');
    db.prepare(
      'UPDATE projects SET status = ?, last_deployed_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run('running', project.id);

    return { success: true };
  } catch (err) {
    emit('error', `\nUpdate error: ${err.message}\n`);
    updateLog('failed');
    db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('failed', project.id);
    return { success: false, error: err.message };
  }
}

module.exports = { deployProject, updateProject };
