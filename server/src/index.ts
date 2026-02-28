import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import { instanceRouter } from './routes/instances';
import { taskRouter } from './routes/tasks';
import { setupWebSocket } from './ws';

const app = express();
const server = http.createServer(app);
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/instances', instanceRouter);
app.use('/api/tasks', taskRouter);

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

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
