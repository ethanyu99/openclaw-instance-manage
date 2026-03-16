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
import { skillsRouter } from './routes/skills';
import { sandboxFilesRouter } from './routes/sandbox-files';
import { setupWebSocket } from './ws';
import { authMiddleware } from './auth';
import { initDB } from './db';
import { initStore, store } from './store';
import { initRedis } from './redis';
import { initSkillLoader } from './skill-loader';
import { errorHandler } from './middleware/error-handler';

const app = express();
const server = http.createServer(app);
const PORT = parseInt(process.env.PORT || '3002', 10);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5174')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
}));
app.use(express.json());

app.use('/api/instances', authMiddleware, instanceRouter);
app.use('/api/tasks', authMiddleware, taskRouter);
app.use('/api/teams', authMiddleware, teamRouter);
app.use('/api/teams', authMiddleware, teamConfigRouter);
app.use('/api/instances', authMiddleware, instanceConfigRouter);
app.use('/api/instances', authMiddleware, sandboxFilesRouter);
app.use('/api/sessions', authMiddleware, sessionRouter);
app.use('/api/executions', authMiddleware, executionRouter);
app.use('/api/skills', authMiddleware, skillsRouter);
app.use('/api/upload', authMiddleware, uploadRouter);
app.use('/api/auth', googleAuthRouter);
app.use('/api/share/view', shareViewRouter);
app.use('/api/share', authMiddleware, shareRouter);

const uploadsDir = path.join(process.cwd(), 'uploads');
app.use('/api/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const clientDist = process.env.CLIENT_DIST_PATH
  || path.join(__dirname, '../../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Global error handling middleware (must be after all routes)
app.use(errorHandler);

const wss = new WebSocketServer({ server, path: '/ws' });

async function start() {
  await initDB();
  await initRedis();
  await initStore();
  initSkillLoader();

  // WebSocket setup (after Redis is ready for pub/sub)
  setupWebSocket(wss);

  setInterval(() => {
    store.cleanExpiredShareTokens();
  }, 3600000);

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  setTimeout(() => process.exit(1), 1000);
});

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
