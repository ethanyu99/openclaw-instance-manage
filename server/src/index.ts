import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { instanceRouter } from './routes/instances';
import { taskRouter } from './routes/tasks';
import { teamRouter } from './routes/teams';
import { uploadRouter } from './routes/upload';
import { instanceConfigRouter, teamConfigRouter } from './routes/sandbox-config';
import { shareRouter, shareViewRouter } from './routes/share';
import { googleAuthRouter } from './routes/google-auth';
import { sessionRouter } from './routes/sessions';
import { executionRouter } from './routes/executions';
import { setupWebSocket } from './ws';
import { authMiddleware } from './auth';
import { initDB } from './db';
import { initStore, store } from './store';

const app = express();
const server = http.createServer(app);
const PORT = parseInt(process.env.PORT || '3002', 10);

app.use(cors());
app.use(express.json());

// Auth middleware for all API routes
app.use('/api/instances', authMiddleware, instanceRouter);
app.use('/api/tasks', authMiddleware, taskRouter);
app.use('/api/teams', authMiddleware, teamRouter);
app.use('/api/teams', authMiddleware, teamConfigRouter);
app.use('/api/instances', authMiddleware, instanceConfigRouter);
app.use('/api/sessions', authMiddleware, sessionRouter);
app.use('/api/executions', authMiddleware, executionRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/auth', googleAuthRouter);
app.use('/api/share/view', shareViewRouter);
app.use('/api/share', authMiddleware, shareRouter);

// Serve locally uploaded files
const uploadsDir = path.join(process.cwd(), 'uploads');
app.use('/api/uploads', express.static(uploadsDir));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
// In dev: tsx runs from server/src, compiled: runs from server/dist/server/src
const clientDist = process.env.CLIENT_DIST_PATH
  || path.join(__dirname, '../../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// WebSocket
const wss = new WebSocketServer({ server, path: '/ws' });
setupWebSocket(wss);

async function start() {
  await initDB();
  await initStore();

  // Clean expired share tokens every hour
  setInterval(() => {
    store.cleanExpiredShareTokens();
  }, 3600000);

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
