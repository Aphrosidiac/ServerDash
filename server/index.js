require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');

const { db, seedAdmin } = require('./db/database');
const { execCommand } = require('./services/ssh');
const authRoutes = require('./routes/auth');
const serverRoutes = require('./routes/servers');
const projectRoutes = require('./routes/projects');
const environmentRoutes = require('./routes/environments');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const server = http.createServer(app);
const allowedOrigins = /^http:\/\/localhost:\d+$/;
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Store io instance for routes to access
app.set('io', io);

// Socket.IO auth
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.username}`);

  socket.on('join:project', (projectId) => {
    socket.join(`project:${projectId}`);
  });

  socket.on('leave:project', (projectId) => {
    socket.leave(`project:${projectId}`);
  });

  // Terminal streaming exec
  socket.on('terminal:exec', async ({ serverId, command }) => {
    const srv = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (!srv) {
      socket.emit('terminal:output', { type: 'error', data: 'Server not found' });
      socket.emit('terminal:done', { code: 1 });
      return;
    }

    try {
      const result = await execCommand(srv, command, undefined,
        (chunk) => socket.emit('terminal:output', { type: 'stdout', data: chunk }),
        (chunk) => socket.emit('terminal:output', { type: 'stderr', data: chunk }),
      );
      socket.emit('terminal:done', { code: result.code });
    } catch (err) {
      socket.emit('terminal:output', { type: 'error', data: err.message });
      socket.emit('terminal:done', { code: 1 });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user.username}`);
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/environments', environmentRoutes);
app.use('/api/webhooks', webhookRoutes);

// Serve frontend in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('/{*splat}', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDist, 'index.html'));
  }
});

// Seed admin user
seedAdmin(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_PASSWORD || 'admin123');

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`ServerDashConf running on http://localhost:${PORT}`);
});
