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
import reportBugRoutes from './routes/reportBug';

const app: Application = express();

// ─── Allowed Origins Setup ───────────────────────────────────────────────────
const configuredOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

const defaultOrigins = [
  'https://ultimoversio.com',
  'https://www.ultimoversio.com',
  'https://ultimoversio.vercel.app',
  'http://localhost:3000',
];

const allowedOrigins = [
  'https://ultimoversio.com',
  'https://www.ultimoversio.com',
  'https://ultimoversio.vercel.app',
];

// ─── CORS (FINAL FIX) ────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      console.log("🌍 Incoming origin:", origin);

      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        console.log("✅ Allowed:", origin);
        return callback(null, origin);
      }

      console.log("❌ Blocked:", origin);
      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Security & Parsing ──────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Logging ─────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Static file serving ─────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Narrator API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ─── API Routes ──────────────────────────────────────────────────────────────
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
app.use('/api/report-bug', reportBugRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: false,
    error: 'Route not found',
  };
  res.status(404).json(response);
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(
  (err: Error & { status?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);

    if (err.message?.includes('CORS blocked')) {
      return res.status(403).json({
        success: false,
        error: 'CORS: Origin not allowed',
      });
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 5}MB`,
      });
    }

    const status = err.status || 500;

    const response: ApiResponse = {
      success: false,
      error: process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
    };

    return res.status(status).json(response);
  }
);

export default app;