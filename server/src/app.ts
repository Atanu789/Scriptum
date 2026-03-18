import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { ApiResponse } from './types';

// Route imports
import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import documentRoutes from './routes/document';
import analysisRoutes from './routes/analysis';
import audioRoutes from './routes/audio';
import exportRoutes from './routes/export';
import userRoutes from './routes/user';
import deepgramRoutes from './routes/deepgram';
import paymentRoutes from './routes/payment';
import adminRoutes from './routes/admin';

const app: Application = express();

const configuredOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const defaultOrigins = [
  'https://ultimoversio.com',
  'https://www.ultimoversio.com',
  'https://ultimoversio.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

// ─── Security & Parsing ──────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...configuredOrigins]));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, curl)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Admin-Action-Key'],
    maxAge: 86400, // Cache preflight for 24h
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Logging ─────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Static file serving for uploads ─────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Narrator API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/document', documentRoutes);
app.use('/api/analyze', analysisRoutes);
app.use('/api/generate-audio', audioRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/user', userRoutes);
app.use('/api/deepgram', deepgramRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: false,
    error: 'Route not found',
  };
  res.status(404).json(response);
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err: Error & { status?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);

  // CORS errors
  if (err.message?.includes('not allowed by CORS')) {
    return res.status(403).json({ success: false, error: 'CORS: Origin not allowed' });
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 5}MB`,
    });
  }

  const status = err.status || 500;
  const response: ApiResponse = {
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  };

  return res.status(status).json(response);
});

export default app;
