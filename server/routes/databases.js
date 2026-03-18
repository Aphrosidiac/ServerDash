const express = require('express');
const { db } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { execCommand } = require('../services/ssh');

const router = express.Router();

const VALID_ENGINES = ['mysql', 'postgresql', 'mongodb'];

function getServer(id) {
  return db.prepare('SELECT * FROM servers WHERE id = ?').get(id);
}

function getCreds(serverId, engine) {
  return db.prepare('SELECT * FROM db_credentials WHERE server_id = ? AND engine = ?').get(serverId, engine);
}

// Filter out MySQL warnings, errors, and junk lines from output
function cleanLines(output) {
  return output.split('\n')
    .map(s => s.trim())
    .filter(s =>
      s &&
      !s.startsWith('Warning') &&
      !s.startsWith('mysql:') &&
      !s.startsWith('ERROR') &&
      !s.startsWith('psql:') &&
      !s.startsWith('MongoServerError') &&
      !s.includes('[Warning]') &&
      !s.includes('Using a password on the command line')
    );
}

// Build the CLI prefix for each engine based on stored credentials
function buildCliPrefix(engine, creds) {
  switch (engine) {
    case 'mysql': {
      if (!creds || creds.auth_method === 'sudo') return 'sudo mysql';
      const user = creds.db_user || 'root';
      const pass = creds.db_password;
      if (pass) return `mysql -u ${user} -p'${pass}'`;
      return `mysql -u ${user}`;
    }
    case 'postgresql': {
      if (!creds || creds.auth_method === 'sudo') return 'sudo -u postgres psql';
      const user = creds.db_user || 'postgres';
      const pass = creds.db_password;
      if (pass) return `PGPASSWORD='${pass}' psql -U ${user}`;
      return `psql -U ${user}`;
    }
    case 'mongodb': {
      if (!creds) return 'mongosh --quiet';
      const user = creds.db_user;
      const pass = creds.db_password;
      if (user && pass) return `mongosh --quiet -u ${user} -p '${pass}' --authenticationDatabase admin`;
      return 'mongosh --quiet';
    }
    default:
      return '';
  }
}

// --- Credentials CRUD ---

router.get('/servers/:id/databases/credentials', authMiddleware, (req, res) => {
  const creds = db.prepare('SELECT id, server_id, engine, db_user, db_password, auth_method, created_at FROM db_credentials WHERE server_id = ?').all(req.params.id);
  res.json(creds);
});

router.post('/servers/:id/databases/credentials', authMiddleware, (req, res) => {
  const { engine, db_user, db_password, auth_method } = req.body;
  if (!VALID_ENGINES.includes(engine)) return res.status(400).json({ error: 'Invalid engine' });

  try {
    db.prepare(`
      INSERT INTO db_credentials (server_id, engine, db_user, db_password, auth_method)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(server_id, engine) DO UPDATE SET db_user=excluded.db_user, db_password=excluded.db_password, auth_method=excluded.auth_method
    `).run(req.params.id, engine, db_user || 'root', db_password || null, auth_method || 'password');
    res.json({ message: 'Credentials saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/servers/:id/databases/credentials/:engine', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM db_credentials WHERE server_id = ? AND engine = ?').run(req.params.id, req.params.engine);
  res.json({ message: 'Credentials removed' });
});

// --- Database operations ---

// Detect installed database engines
router.get('/servers/:id/databases/detect', authMiddleware, async (req, res) => {
  const server = getServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  try {
    const cmd = 'which mysql 2>/dev/null; which psql 2>/dev/null; which mongosh 2>/dev/null || which mongo 2>/dev/null; echo done';
    const result = await execCommand(server, cmd);
    const out = result.stdout;

    const engines = [];
    if (out.includes('/mysql')) engines.push('mysql');
    if (out.includes('/psql')) engines.push('postgresql');
    if (out.includes('/mongosh') || out.includes('/mongo')) engines.push('mongodb');

    res.json({ engines });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List databases for an engine
router.get('/servers/:id/databases/:engine/list', authMiddleware, async (req, res) => {
  const { id, engine } = req.params;
  if (!VALID_ENGINES.includes(engine)) return res.status(400).json({ error: 'Invalid engine' });

  const server = getServer(id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const creds = getCreds(id, engine);
  const cli = buildCliPrefix(engine, creds);

  try {
    let cmd;
    switch (engine) {
      case 'mysql':
        cmd = `${cli} -N -e "SHOW DATABASES" 2>&1`;
        break;
      case 'postgresql':
        cmd = `${cli} -t -A -c "SELECT datname FROM pg_database WHERE datistemplate = false" 2>&1`;
        break;
      case 'mongodb':
        cmd = `${cli} --eval "db.adminCommand('listDatabases').databases.forEach(d => print(d.name))" 2>&1`;
        break;
    }

    const result = await execCommand(server, cmd);
    const output = result.stdout;

    if (output.includes('Access denied') || output.includes('authentication failed') || output.includes('ECONNREFUSED')) {
      return res.status(403).json({ error: output.trim(), needsCredentials: true });
    }

    res.json({ databases: cleanLines(output) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List tables/collections for a database
router.get('/servers/:id/databases/:engine/:dbname/tables', authMiddleware, async (req, res) => {
  const { id, engine, dbname } = req.params;
  if (!VALID_ENGINES.includes(engine)) return res.status(400).json({ error: 'Invalid engine' });

  const server = getServer(id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (!/^[\w-]+$/.test(dbname)) return res.status(400).json({ error: 'Invalid database name' });

  const creds = getCreds(id, engine);
  const cli = buildCliPrefix(engine, creds);

  try {
    let cmd;
    switch (engine) {
      case 'mysql':
        cmd = `${cli} ${dbname} -N -e "SHOW TABLES" 2>&1`;
        break;
      case 'postgresql':
        cmd = `${cli} ${dbname} -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public'" 2>&1`;
        break;
      case 'mongodb':
        cmd = `${cli} ${dbname} --eval "db.getCollectionNames().forEach(c => print(c))" 2>&1`;
        break;
    }

    const result = await execCommand(server, cmd);

    if (result.stdout.includes('Access denied') || result.stdout.includes('ERROR 1044')) {
      return res.status(403).json({ error: result.stdout.trim(), needsCredentials: true });
    }

    res.json({ tables: cleanLines(result.stdout) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full schema: all tables, columns, and foreign key relationships
router.get('/servers/:id/databases/:engine/:dbname/schema', authMiddleware, async (req, res) => {
  const { id, engine, dbname } = req.params;
  if (!VALID_ENGINES.includes(engine)) return res.status(400).json({ error: 'Invalid engine' });
  if (!/^[\w-]+$/.test(dbname)) return res.status(400).json({ error: 'Invalid database name' });

  const server = getServer(id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const creds = getCreds(id, engine);
  const cli = buildCliPrefix(engine, creds);

  try {
    let tablesCmd, columnsCmd, fksCmd;

    switch (engine) {
      case 'mysql':
        // Get all tables, columns with types/keys, and foreign keys in 3 commands
        tablesCmd = `${cli} ${dbname} -N -e "SHOW TABLES" 2>&1`;
        columnsCmd = `${cli} ${dbname} --batch --raw -e "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLUMN_KEY, IS_NULLABLE, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${dbname}' ORDER BY TABLE_NAME, ORDINAL_POSITION" 2>&1`;
        fksCmd = `${cli} ${dbname} --batch --raw -e "SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='${dbname}' AND REFERENCED_TABLE_NAME IS NOT NULL" 2>&1`;
        break;
      case 'postgresql':
        tablesCmd = `${cli} ${dbname} -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname='public'" 2>&1`;
        columnsCmd = `${cli} ${dbname} -A -F'\t' -c "SELECT table_name, column_name, data_type, CASE WHEN pk.column_name IS NOT NULL THEN 'PRI' ELSE '' END as column_key, is_nullable, '' as extra FROM information_schema.columns c LEFT JOIN (SELECT ku.column_name, ku.table_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public') pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name WHERE c.table_schema='public' ORDER BY c.table_name, c.ordinal_position" 2>&1`;
        fksCmd = `${cli} ${dbname} -A -F'\t' -c "SELECT tc.table_name, kcu.column_name, ccu.table_name AS referenced_table, ccu.column_name AS referenced_column, tc.constraint_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'" 2>&1`;
        break;
      case 'mongodb':
        // MongoDB has no schema/FK — just list collections with sample fields
        tablesCmd = `${cli} ${dbname} --eval "db.getCollectionNames().forEach(c => print(c))" 2>&1`;
        columnsCmd = `${cli} ${dbname} --eval "db.getCollectionNames().forEach(c => { const doc = db[c].findOne(); const fields = doc ? Object.keys(doc).map(k => c + '\\\\t' + k + '\\\\t' + typeof doc[k]).join('\\\\n') : c + '\\\\t(empty)\\\\tobject'; print(fields); })" 2>&1`;
        fksCmd = 'echo ""'; // no FKs in MongoDB
        break;
    }

    const [tablesResult, columnsResult, fksResult] = await Promise.all([
      execCommand(server, tablesCmd),
      execCommand(server, columnsCmd),
      execCommand(server, fksCmd),
    ]);

    const tableNames = cleanLines(tablesResult.stdout);

    // Parse columns into { tableName: [{ name, type, key, nullable, extra }] }
    const tableColumns = {};
    const colLines = cleanLines(columnsResult.stdout);
    const colDataLines = colLines.length > 0 && colLines[0].includes('TABLE_NAME') ? colLines.slice(1) : colLines;
    for (const line of colDataLines) {
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      const tableName = parts[0];
      if (!tableColumns[tableName]) tableColumns[tableName] = [];
      tableColumns[tableName].push({
        name: parts[1],
        type: parts[2],
        key: parts[3] || '',
        nullable: parts[4] || 'YES',
        extra: parts[5] || '',
      });
    }

    // Parse foreign keys into [{ table, column, refTable, refColumn, constraint }]
    const foreignKeys = [];
    const fkLines = cleanLines(fksResult.stdout);
    const fkDataLines = fkLines.length > 0 && fkLines[0].includes('TABLE_NAME') ? fkLines.slice(1) : fkLines;
    for (const line of fkDataLines) {
      const parts = line.split('\t');
      if (parts.length < 4) continue;
      foreignKeys.push({
        table: parts[0],
        column: parts[1],
        refTable: parts[2],
        refColumn: parts[3],
        constraint: parts[4] || '',
      });
    }

    // Build tables array
    const tables = tableNames.map(name => ({
      name,
      columns: tableColumns[name] || [],
    }));

    res.json({ tables, foreignKeys });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Table info (columns) + preview
router.get('/servers/:id/databases/:engine/:dbname/:table/info', authMiddleware, async (req, res) => {
  const { id, engine, dbname, table } = req.params;
  if (!VALID_ENGINES.includes(engine)) return res.status(400).json({ error: 'Invalid engine' });
  if (!/^[\w-]+$/.test(dbname) || !/^[\w-]+$/.test(table)) return res.status(400).json({ error: 'Invalid name' });

  const server = getServer(id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const creds = getCreds(id, engine);
  const cli = buildCliPrefix(engine, creds);

  try {
    let columnsCmd, previewCmd, countCmd;
    switch (engine) {
      case 'mysql':
        columnsCmd = `${cli} ${dbname} -e "DESCRIBE \\\`${table}\\\`" --batch --raw 2>&1`;
        previewCmd = `${cli} ${dbname} -e "SELECT * FROM \\\`${table}\\\` LIMIT 20" --batch --raw 2>&1`;
        countCmd = `${cli} ${dbname} -N -e "SELECT COUNT(*) FROM \\\`${table}\\\`" 2>&1`;
        break;
      case 'postgresql':
        columnsCmd = `${cli} ${dbname} -A -F'\t' -c "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='${table}' AND table_schema='public' ORDER BY ordinal_position" 2>&1`;
        previewCmd = `${cli} ${dbname} -A -F'\t' -c "SELECT * FROM \\"${table}\\" LIMIT 20" 2>&1`;
        countCmd = `${cli} ${dbname} -t -A -c "SELECT COUNT(*) FROM \\"${table}\\"" 2>&1`;
        break;
      case 'mongodb':
        columnsCmd = `${cli} ${dbname} --eval "const doc = db.${table}.findOne(); if(doc) { Object.keys(doc).forEach(k => print(k + '\\\\t' + typeof doc[k])) } else { print('(empty collection)') }" 2>&1`;
        previewCmd = `${cli} ${dbname} --eval "db.${table}.find().limit(20).forEach(d => print(JSON.stringify(d)))" 2>&1`;
        countCmd = `${cli} ${dbname} --eval "print(db.${table}.countDocuments())" 2>&1`;
        break;
    }

    const [colResult, previewResult, countResult] = await Promise.all([
      execCommand(server, columnsCmd),
      execCommand(server, previewCmd),
      execCommand(server, countCmd),
    ]);

    // Parse columns
    let columns = [];
    const colLines = cleanLines(colResult.stdout);
    if (engine === 'mysql' && colLines.length > 0) {
      // First line is header: Field Type Null Key Default Extra
      columns = colLines.slice(1).map(line => {
        const parts = line.split('\t');
        return { name: parts[0], type: parts[1], nullable: parts[2], key: parts[3], default: parts[4] };
      });
    } else if (engine === 'postgresql' && colLines.length > 0) {
      const hasHeader = colLines[0].includes('column_name');
      const dataLines = hasHeader ? colLines.slice(1) : colLines;
      columns = dataLines.filter(l => !l.startsWith('(')).map(line => {
        const parts = line.split('\t');
        return { name: parts[0], type: parts[1], nullable: parts[2], default: parts[3] };
      });
    } else if (engine === 'mongodb') {
      columns = colLines.map(line => {
        const parts = line.split('\t');
        return { name: parts[0], type: parts[1] || 'unknown' };
      });
    }

    // Parse preview
    let previewColumns = [];
    let previewRows = [];
    const prevLines = cleanLines(previewResult.stdout);

    if (engine === 'mongodb') {
      previewRows = prevLines.map(line => {
        try { return JSON.parse(line); } catch { return { raw: line }; }
      });
      if (previewRows.length > 0) {
        previewColumns = Object.keys(previewRows[0]);
        previewRows = previewRows.map(row => previewColumns.map(col => {
          const val = row[col];
          return typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
        }));
      }
    } else if (prevLines.length > 0) {
      previewColumns = prevLines[0].split('\t');
      previewRows = prevLines.slice(1).filter(l => !l.startsWith('(')).map(line => line.split('\t'));
    }

    // Parse count
    const countStr = cleanLines(countResult.stdout).join('').trim();
    const rowCount = parseInt(countStr) || 0;

    res.json({ columns, preview: { columns: previewColumns, rows: previewRows }, rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Execute a query
router.post('/servers/:id/databases/:engine/:dbname/query', authMiddleware, async (req, res) => {
  const { id, engine, dbname } = req.params;
  const { query } = req.body;

  if (!VALID_ENGINES.includes(engine)) return res.status(400).json({ error: 'Invalid engine' });
  if (!query || !query.trim()) return res.status(400).json({ error: 'Query is required' });
  if (!/^[\w-]+$/.test(dbname)) return res.status(400).json({ error: 'Invalid database name' });

  const server = getServer(id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const creds = getCreds(id, engine);
  const cli = buildCliPrefix(engine, creds);

  const b64 = Buffer.from(query).toString('base64');

  try {
    let cmd;
    switch (engine) {
      case 'mysql':
        cmd = `echo '${b64}' | base64 -d | ${cli} ${dbname} --batch --raw 2>&1`;
        break;
      case 'postgresql':
        cmd = `echo '${b64}' | base64 -d | ${cli} ${dbname} -t -A -F'\t' 2>&1`;
        break;
      case 'mongodb':
        cmd = `QUERY=$(echo '${b64}' | base64 -d) && ${cli} ${dbname} --eval "$QUERY" 2>&1`;
        break;
    }

    const result = await execCommand(server, cmd);
    const output = result.stdout;
    const lines = cleanLines(output);

    let columns = [];
    let rows = [];

    if (engine === 'mongodb') {
      res.json({ columns: ['result'], rows: lines.map(line => [line]), rowCount: lines.length, raw: output });
    } else if (engine === 'mysql') {
      if (lines.length > 0) {
        columns = lines[0].split('\t');
        rows = lines.slice(1).map(line => line.split('\t'));
      }
      res.json({ columns, rows, rowCount: rows.length });
    } else {
      const colCmd = `echo '${b64}' | base64 -d | ${cli} ${dbname} -A -F'\t' 2>&1 | head -1`;
      const colResult = await execCommand(server, colCmd);
      columns = colResult.stdout.trim().split('\t');
      rows = lines.filter(l => !l.startsWith('(')).map(line => line.split('\t'));
      res.json({ columns, rows, rowCount: rows.length });
    }

    db.prepare('INSERT INTO query_history (server_id, engine, database_name, query) VALUES (?, ?, ?, ?)')
      .run(id, engine, dbname, query);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Query history
router.get('/databases/history', authMiddleware, (req, res) => {
  const history = db.prepare(`
    SELECT qh.*, s.name as server_name
    FROM query_history qh
    JOIN servers s ON qh.server_id = s.id
    ORDER BY qh.executed_at DESC
    LIMIT 100
  `).all();
  res.json(history);
});

// Delete history entry
router.delete('/databases/history/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM query_history WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
