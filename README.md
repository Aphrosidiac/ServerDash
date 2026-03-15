# ServerDashConf

A full-stack server deployment and management dashboard. Register remote servers, configure projects, trigger deployments, monitor system health, browse files, and execute commands — all through a real-time web interface.

![Node.js](https://img.shields.io/badge/Node.js-16+-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Running](#running)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
  - [Authentication](#authentication)
  - [SSH Connection Pool](#ssh-connection-pool)
  - [Deployment Pipeline](#deployment-pipeline)
  - [Real-Time Updates](#real-time-updates)
- [API Reference](#api-reference)
  - [Auth Endpoints](#auth-endpoints)
  - [Server Endpoints](#server-endpoints)
  - [Project Endpoints](#project-endpoints)
- [Database Schema](#database-schema)
- [Frontend Pages](#frontend-pages)
- [Socket.io Events](#socketio-events)
- [Deployment Examples](#deployment-examples)
- [Production Checklist](#production-checklist)
- [Known Limitations](#known-limitations)

---

## Features

- **Server Management** — Register servers with SSH password or key-based authentication
- **System Monitoring** — Real-time CPU, memory, disk, network stats and top processes
- **Project Deployment** — Git pull → build → restart with one click
- **Live Deploy Logs** — Stream deployment output in real-time via WebSocket
- **Remote Terminal** — Execute commands on servers directly from the browser
- **File Browser** — Navigate, read, and edit files on remote servers
- **Deploy History** — Track all deployments with full output logs
- **Dark Terminal UI** — Hacker-aesthetic interface with green accent theme

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router 7, Tailwind CSS 4, Vite 7 |
| Backend | Node.js, Express 5, Socket.io 4 |
| Database | SQLite via better-sqlite3 |
| Auth | JWT + bcrypt |
| SSH | node-ssh |
| Icons | lucide-react |
| Notifications | react-hot-toast |

---

## Getting Started

### Prerequisites

- **Node.js** 16 or higher
- **npm** (comes with Node.js)
- SSH access to the remote servers you want to manage

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd ServerDashConf

# Install server dependencies
npm install

# Install client dependencies
cd client && npm install && cd ..
```

### Configuration

Create a `.env` file in the project root:

```env
PORT=3456
JWT_SECRET=your-strong-random-secret-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=a-strong-password
```

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3456` |
| `JWT_SECRET` | Secret key for signing JWT tokens | `change-this-to-a-strong-random-secret` |
| `ADMIN_USERNAME` | Default admin username | `admin` |
| `ADMIN_PASSWORD` | Default admin password | `admin123` |

> **Important:** Change `JWT_SECRET` and `ADMIN_PASSWORD` before running in any non-local environment.

### Running

**Development** (hot-reload frontend + backend):

```bash
npm run dev
```

This starts:
- Backend on `http://localhost:3456`
- Frontend on `http://localhost:5173` (proxies API requests to backend)

**Production:**

```bash
npm start
```

This builds the React app and serves everything from `http://localhost:3456`.

**Individual processes:**

```bash
npm run dev:server   # Backend only
npm run dev:client   # Frontend only
npm run build        # Build frontend to client/dist/
```

---

## Project Structure

```
ServerDashConf/
├── .env                              # Environment variables
├── package.json                      # Root dependencies & scripts
├── server/
│   ├── index.js                      # Express app, Socket.io, SPA fallback
│   ├── db/
│   │   └── database.js               # SQLite schema & admin seeding
│   ├── middleware/
│   │   └── auth.js                   # JWT verification middleware
│   ├── routes/
│   │   ├── auth.js                   # Login / logout / session
│   │   ├── servers.js                # Server CRUD, stats, files, terminal
│   │   └── projects.js               # Project CRUD, deploy, logs
│   └── services/
│       ├── ssh.js                    # SSH connection pool & command exec
│       └── deploy.js                 # Deployment pipeline orchestration
├── client/
│   ├── vite.config.js                # Vite + proxy config
│   ├── src/
│   │   ├── App.jsx                   # Router & protected routes
│   │   ├── api.js                    # API client (~30 methods)
│   │   ├── socket.js                 # Socket.io client
│   │   ├── index.css                 # Tailwind + dark theme variables
│   │   ├── context/
│   │   │   └── AuthContext.jsx       # Auth state & token management
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Servers.jsx
│   │   │   ├── ServerDetail.jsx
│   │   │   ├── Projects.jsx
│   │   │   └── ProjectDetail.jsx
│   │   └── components/
│   │       ├── Layout.jsx            # Sidebar navigation
│   │       ├── Modal.jsx             # Reusable dialog
│   │       ├── Terminal.jsx          # Streaming output viewer
│   │       └── StatusBadge.jsx       # Color-coded status indicator
│   └── dist/                         # Production build output
```

---

## Architecture

### Authentication

1. User submits credentials to `POST /api/auth/login`
2. Server verifies password against bcrypt hash in SQLite
3. On success, a JWT token (7-day expiry) is returned in the response body and set as an httpOnly cookie
4. Frontend stores the token in `localStorage` and attaches it as a `Bearer` token on all API requests
5. The `authMiddleware` validates the token on every protected route
6. Socket.io connections authenticate via the `auth.token` handshake field

### SSH Connection Pool

The SSH service (`server/services/ssh.js`) maintains a pool of active connections keyed by `host:port:username`. Connections are reused across requests and automatically re-established if dropped. Supports three authentication methods:

| Method | Description |
|--------|-------------|
| `password` | Plain SSH password |
| `key_path` | Path to a private key file on the host machine |
| `key_paste` | Private key content pasted directly in the UI |

### Deployment Pipeline

When `POST /api/projects/:id/deploy` is called:

```
1. Set project status → "deploying"
2. Create deploy_log entry (status: "running")
3. Return 200 immediately (non-blocking)
4. [Async] SSH into server
5. [Async] cd {project.path} && git pull origin {branch}
6. [Async] Run build_command (if configured)
7. [Async] Run restart_command (or stop + start)
8. [Async] Update deploy_log and project status
```

Each step streams output to the frontend in real-time via Socket.io.

### Real-Time Updates

Socket.io powers live deployment output:

1. Frontend joins a project room: `socket.emit('join:project', projectId)`
2. Backend emits `deploy:output` events during deployment
3. Output is color-coded by type: `info` (blue), `stdout` (green), `stderr` (yellow), `error` (red)
4. Frontend renders output in a terminal-style component with auto-scroll

---

## API Reference

All endpoints are prefixed with `/api`. Protected routes require a valid JWT token via `Authorization: Bearer <token>` header or `token` cookie.

### Auth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/login` | No | Authenticate with username & password |
| `POST` | `/auth/logout` | Yes | Clear auth cookie |
| `GET` | `/auth/me` | Yes | Get current user info |

**Login request:**
```json
POST /api/auth/login
{ "username": "admin", "password": "admin123" }
```

**Login response:**
```json
{
  "user": { "id": 1, "username": "admin" },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Server Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/servers` | List all servers |
| `GET` | `/servers/:id` | Get server details |
| `POST` | `/servers` | Register a new server |
| `PUT` | `/servers/:id` | Update server config |
| `DELETE` | `/servers/:id` | Delete server (cascades to projects) |
| `POST` | `/servers/:id/test` | Test SSH connection |
| `GET` | `/servers/:id/stats` | Get system stats (CPU, RAM, disk, network) |
| `GET` | `/servers/:id/processes` | Get top 15 processes by CPU |
| `GET` | `/servers/:id/files?path=/home` | List directory contents |
| `POST` | `/servers/:id/read` | Read file content |
| `POST` | `/servers/:id/write` | Write file content |
| `POST` | `/servers/:id/exec` | Execute a shell command |
| `GET` | `/servers/:id/projects` | List projects on this server |

**Create server request:**
```json
POST /api/servers
{
  "name": "Production-01",
  "host": "192.168.1.100",
  "port": 22,
  "username": "root",
  "auth_type": "password",
  "server_password": "server-password-here"
}
```

### Project Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/projects` | List all projects (with server info) |
| `GET` | `/projects/:id` | Get project details |
| `POST` | `/projects` | Create a new project |
| `PUT` | `/projects/:id` | Update project config |
| `DELETE` | `/projects/:id` | Delete project |
| `POST` | `/projects/:id/deploy` | Trigger deployment |
| `POST` | `/projects/:id/exec` | Run command in project directory |
| `GET` | `/projects/:id/logs` | Get last 20 deploy logs |
| `POST` | `/projects/:id/status` | Check status & last commit |

**Create project request:**
```json
POST /api/projects
{
  "server_id": 1,
  "name": "my-app",
  "path": "/home/deploy/my-app",
  "repo_url": "https://github.com/user/repo.git",
  "branch": "main",
  "build_command": "npm run build",
  "start_command": "pm2 start app.js --name my-app",
  "stop_command": "pm2 stop my-app",
  "restart_command": "pm2 restart my-app"
}
```

---

## Database Schema

SQLite database stored at `server/db/serverdash.db` (WAL mode, foreign keys enabled).

### users

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER (PK) | Auto-increment |
| username | TEXT (UNIQUE) | Login username |
| password_hash | TEXT | bcrypt hash |
| created_at | DATETIME | Account creation time |

### servers

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER (PK) | Auto-increment |
| name | TEXT | Display name |
| host | TEXT | Hostname or IP |
| port | INTEGER | SSH port (default: 22) |
| username | TEXT | SSH username |
| auth_type | TEXT | `password`, `key_paste`, or `key_path` |
| private_key_path | TEXT | Path to SSH key file |
| private_key | TEXT | SSH key content (pasted) |
| server_password | TEXT | SSH password |
| created_at | DATETIME | Registration time |

### projects

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER (PK) | Auto-increment |
| server_id | INTEGER (FK) | References servers.id (CASCADE) |
| name | TEXT | Project name |
| path | TEXT | Remote directory path |
| repo_url | TEXT | Git repository URL |
| branch | TEXT | Git branch (default: main) |
| build_command | TEXT | Pre-restart build step |
| start_command | TEXT | Start application |
| stop_command | TEXT | Stop application |
| restart_command | TEXT | Restart application (preferred) |
| status | TEXT | `running`, `stopped`, `failed`, `deploying`, `unknown` |
| last_deployed_at | DATETIME | Last successful deploy |
| created_at | DATETIME | Creation time |

### deploy_logs

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER (PK) | Auto-increment |
| project_id | INTEGER (FK) | References projects.id (CASCADE) |
| action | TEXT | Action type (e.g., `deploy`) |
| output | TEXT | Full deployment output |
| status | TEXT | `running`, `success`, `failed` |
| started_at | DATETIME | Deploy start time |
| finished_at | DATETIME | Deploy end time |

---

## Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| **Login** | `/login` | Username/password authentication form |
| **Dashboard** | `/` | Overview with server/project counts, status summary, project table |
| **Servers** | `/servers` | Server list with add/edit/delete, connection testing |
| **Server Detail** | `/servers/:id` | System stats, processes, file browser, inline terminal |
| **Projects** | `/projects` | Project list with add/edit/delete |
| **Project Detail** | `/projects/:id` | Deploy button, live terminal output, command exec, deploy history |

---

## Socket.io Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join:project` | `projectId` (number) | Subscribe to deployment updates |
| `leave:project` | `projectId` (number) | Unsubscribe from updates |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `deploy:output` | `{ logId, projectId, type, data }` | Streaming deployment output |

**Output types:** `info`, `stdout`, `stderr`, `error`

---

## Deployment Examples

### PM2 (Node.js)

```
Build Command:    npm install && npm run build
Start Command:    pm2 start app.js --name my-app
Stop Command:     pm2 stop my-app
Restart Command:  pm2 restart my-app
```

### Docker

```
Build Command:    docker build -t my-app .
Start Command:    docker run -d --name my-app -p 3000:3000 my-app
Stop Command:     docker stop my-app && docker rm my-app
Restart Command:  docker restart my-app
```

### Systemd

```
Build Command:    npm install && npm run build
Restart Command:  sudo systemctl restart my-app
```

---

## Production Checklist

- [ ] Set a strong, random `JWT_SECRET` in `.env`
- [ ] Change default `ADMIN_USERNAME` and `ADMIN_PASSWORD`
- [ ] Update CORS origin from `localhost:*` to your actual domain (in `server/index.js`)
- [ ] Ensure `server/db/serverdash.db` is persisted (not in a temporary filesystem)
- [ ] Use `key_path` auth instead of `key_paste` to avoid storing keys in the database
- [ ] Set up a reverse proxy (nginx/caddy) with HTTPS in front of the app
- [ ] Consider adding rate limiting to prevent brute-force attacks
- [ ] Back up the SQLite database regularly

---

## Known Limitations

- **Single user** — Only one admin account, no role-based access control
- **No HTTPS** — Requires a reverse proxy for TLS termination
- **No notifications** — No email/Slack alerts for deploy success/failure
- **No input sanitization** — Command execution endpoints accept raw input
- **No tests** — No automated test suite
- **No TypeScript** — Frontend and backend use plain JavaScript
- **Plaintext credential storage** — SSH passwords and keys are stored unencrypted in SQLite

---

## License

ISC
