/**
 * Validates that all required environment variables are set at startup.
 * Fails fast with a clear error message if any are missing.
 */

const REQUIRED_VARS = [
  'MONGO_URI',
  'JWT_SECRET',
] as const;

const OPTIONAL_VARS = [
  { key: 'GEMINI_API_KEY',          warn: 'AI analysis will be disabled' },
  { key: 'TEXTGEARS_API_KEY',       warn: 'Readability will use local Flesch calculation only' },
  { key: 'CLIENT_URL',              warn: 'CORS will default to http://localhost:3000' },
  { key: 'DEEPGRAM_API_KEY',        warn: 'Teleprompter mic-sync and TTS will be unavailable' },
  { key: 'DEEPGRAM_PROJECT_ID',     warn: 'Deepgram temp-key generation will fail — set project ID for production' },
  { key: 'GOOGLE_CLIENT_ID',        warn: 'Google sign-in will be unavailable' },
  { key: 'ADMIN_USERNAME',          warn: 'Admin dashboard login will be unavailable' },
  { key: 'ADMIN_PASSWORD',          warn: 'Admin dashboard login will be unavailable' },
  { key: 'ADMIN_ACTION_KEY',        warn: 'Sensitive admin actions (patch/delete) will fail' },
  { key: 'RAZORPAY_KEY_ID',         warn: 'Payments will be unavailable — set Razorpay credentials' },
  { key: 'RAZORPAY_KEY_SECRET',     warn: 'Payment verification will fail — set RAZORPAY_KEY_SECRET' },
  { key: 'RAZORPAY_WEBHOOK_SECRET', warn: 'Webhook signature verification will fail — set RAZORPAY_WEBHOOK_SECRET' },
] as const;

export function validateEnv(): void {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]?.trim()) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error('❌  Missing required environment variables:');
    missing.forEach((k) => console.error(`   - ${k}`));
    console.error('\nPlease set them in your .env file and restart the server.');
    process.exit(1);
  }

  // Warn about optional vars
  for (const { key, warn } of OPTIONAL_VARS) {
    if (!process.env[key]?.trim()) {
      console.warn(`⚠️  ${key} not set — ${warn}`);
    }
  }

  // Validate JWT_SECRET strength
  const jwtSecret = process.env.JWT_SECRET!;
  if (jwtSecret.length < 32) {
    console.warn('⚠️  JWT_SECRET is shorter than 32 characters — consider using a stronger secret in production');
  }

  console.log('✅  Environment variables validated');
}
