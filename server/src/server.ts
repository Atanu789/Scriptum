import dotenv from 'dotenv';
import http from 'http';
import app from './app';
import connectDB from './config/db';
import { validateEnv } from './config/validateEnv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ─── Validate env ─────────────────────────────────────────────
validateEnv();

const PORT = parseInt(process.env.PORT || '5001', 10);

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`📁 Created upload directory: ${uploadDir}`);
}

const startServer = async (): Promise<void> => {
  try {
    await connectDB();

    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
      console.log(`📍 Health: http://localhost:${PORT}/health`);
    });

    // ─── SAFE ERROR LOGGING (NO EXIT) ─────────────────────────

    process.on('unhandledRejection', (reason: unknown) => {
      console.error('❌ Unhandled Promise Rejection:', reason);
    });

    process.on('uncaughtException', (err: Error) => {
      console.error('❌ Uncaught Exception:', err);
    });

    // 🔥 IMPORTANT: DO NOT EXIT (PM2 handles this)
    process.on('SIGINT', () => {
      console.log('⚠️ SIGINT received (ignored in PM2)');
    });

    process.on('SIGTERM', () => {
      console.log('⚠️ SIGTERM received (ignored in PM2)');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();