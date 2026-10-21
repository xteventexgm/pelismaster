import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import apiRouter from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for webOS TV and any local client
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// API Routes
app.use('/api', apiRouter);

// Serve TV client static files if available
const clientPath = path.resolve(__dirname, '../../client');
app.use(express.static(clientPath));

// Fallback to client index.html for SPA routing if needed
app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api')) return next();
  res.sendFile(path.join(clientPath, 'index.html'), (err) => {
    if (err) {
      res.json({
        ok: true,
        message: 'PelisMaster TV Backend funcionando correctamente.',
        endpoints: [
          '/api/home',
          '/api/movies',
          '/api/series',
          '/api/genres',
          '/api/search?q=',
          '/api/detail/:type/:slug',
          '/api/servers/:type/:slug',
          '/api/stream/:type/:slug'
        ]
      });
    }
  });
});

// Find Local Network IP for Smart TV access
const getLocalIp = () => {
  const nets = os.networkInterfaces();
  // Check Wi-Fi or 192.168.3.x first
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && net.address.startsWith('192.168.3.')) {
        return net.address;
      }
    }
  }
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '192.168.3.155';
};

app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log('==================================================');
  console.log(`  🎬 PelisMaster TV Server Activo`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  SmartTV: http://${localIp}:${PORT}`);
  console.log('==================================================');
});
