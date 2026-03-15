const { NodeSSH } = require('node-ssh');
const fs = require('fs');

const activeConnections = new Map();

async function getConnection(server) {
  const key = `${server.host}:${server.port}:${server.username}`;

  if (activeConnections.has(key)) {
    const conn = activeConnections.get(key);
    if (conn.isConnected()) return conn;
    activeConnections.delete(key);
  }

  const ssh = new NodeSSH();
  const connectOpts = {
    host: server.host,
    port: server.port,
    username: server.username,
    readyTimeout: 10000,
  };

  if (server.auth_type === 'key_paste' && server.private_key) {
    let pk = server.private_key.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim() + '\n';
    connectOpts.privateKey = pk;
  } else if (server.auth_type === 'key_path' && server.private_key_path) {
    connectOpts.privateKey = fs.readFileSync(server.private_key_path, 'utf8');
  } else {
    connectOpts.password = server.server_password;
  }

  await ssh.connect(connectOpts);

  activeConnections.set(key, ssh);
  return ssh;
}

async function execCommand(server, command, cwd, onStdout, onStderr) {
  const ssh = await getConnection(server);

  const result = await ssh.execCommand(command, {
    cwd,
    onStdout: onStdout ? (chunk) => onStdout(chunk.toString('utf8')) : undefined,
    onStderr: onStderr ? (chunk) => onStderr(chunk.toString('utf8')) : undefined,
  });

  return result;
}

async function testConnection(server) {
  try {
    const ssh = await getConnection(server);
    const result = await ssh.execCommand('echo "connected"');
    return { success: true, message: result.stdout.trim() };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

function disconnectAll() {
  for (const [key, conn] of activeConnections) {
    conn.dispose();
  }
  activeConnections.clear();
}

module.exports = { getConnection, execCommand, testConnection, disconnectAll };
