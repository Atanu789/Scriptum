import express, { Application, Request, Response, NextFunction } from 'express';
import dotenv from "dotenv";
dotenv.config();

import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { ApiResponse } from './types';

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
import humanizerRoutes from './routes/humanizer';

const app: Application = express();


// 🔥 CRITICAL FIX (proxy)
app.set('trust proxy', 1);


// ─────────────────────────────────────────────────────────────
// 🔥 CORS MUST BE FIRST (VERY IMPORTANT)
// ─────────────────────────────────────────────────────────────

const allowedOrigins = [
  'https://ultimoversio.com',
  'https://www.ultimoversio.com',
  'https://ultimoversio.vercel.app',
  'http://localhost:3000',
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    console.log('🌍 Origin:', origin);

    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }

    return callback(null, true); // ✅ DO NOT BLOCK (important)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));


// 🔥 FORCE HANDLE PREFLIGHT (CRITICAL)
app.use((req, res, next): void => {
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});


// ─────────────────────────────────────────────────────────────
// SECURITY + BODY
// ─────────────────────────────────────────────────────────────

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// ─────────────────────────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}


// ─────────────────────────────────────────────────────────────
// STATIC
// ─────────────────────────────────────────────────────────────

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));


// ─────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Narrator API is running',
  });
});


// ─────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────

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
app.use('/api/humanizer', humanizerRoutes);


// ─────────────────────────────────────────────────────────────
// 404
// ─────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});


// ─────────────────────────────────────────────────────────────
// GLOBAL ERROR HANDLER (SAFE)
// ─────────────────────────────────────────────────────────────

app.use(
  (err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('🔥 ERROR:', err);

    // 🔥 ALWAYS SEND CORS HEADERS EVEN ON ERROR
    res.header("Access-Control-Allow-Origin", "*");

    // Handle rate limiter crash
    if (err.message?.includes('X-Forwarded-For')) {
      return res.status(200).json({
        success: true,
        warning: 'Rate limiter handled',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
);

export default app;