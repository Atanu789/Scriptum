import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { deepgramTokenLimiter } from '../middleware/rateLimiter';
import { checkTTSNarrationAccess, requireFeature } from '../middleware/planAccess';
import { generateTempKey, streamTTS } from '../services/deepgram';
import { ApiResponse } from '../types';

const router = Router();

// ─── GET /api/deepgram/token ──────────────────────────────────────────────────
// Returns a short-lived Deepgram key for the authenticated user.
// Rate limited to 10 requests / hour per user.

router.get(
  '/token',
  authenticate,
  requireFeature('teleprompterAI'),
  deepgramTokenLimiter,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await generateTempKey(900); // 15-minute key
      const response: ApiResponse<{ key: string; expiresAt: string }> = {
        success: true,
        data: result,
      };
      res.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate token';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  },
);

// ─── POST /api/deepgram/tts ───────────────────────────────────────────────────
// Streams Deepgram Aura TTS audio back to the client.

router.post(
  '/tts',
  authenticate,
  checkTTSNarrationAccess,
  async (req: Request, res: Response): Promise<void> => {
    const { text, model } = req.body as { text?: string; model?: string };

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({ success: false, error: 'text is required' } satisfies ApiResponse);
      return;
    }

    // Hard cap: 500 words per request to keep each chunk ≤ ~15s of audio
    const words   = text.trim().split(/\s+/);
    const trimmed = words.slice(0, 500).join(' ');

    if (trimmed.length === 0) {
      res.status(400).json({ success: false, error: 'text is empty after trimming' } satisfies ApiResponse);
      return;
    }

    try {
      const stream = await streamTTS(trimmed, model ?? 'aura-2-draco-en');
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-store');
      stream.pipe(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'TTS failed';
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: message } satisfies ApiResponse);
      }
    }
  },
);

export default router;
