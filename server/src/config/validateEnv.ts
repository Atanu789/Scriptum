/**
 * Validates that all required environment variables are set at startup.
 * Fails fast with a clear error message if any are missing.
 */

const REQUIRED_VARS = [
  'MONGO_URI',
  'JWT_SECRET',
] as const;

const OPTIONAL_VARS = [
  { key: 'TEXTGEARS_API_KEY',       warn: 'Readability will use local Flesch calculation only' },
  { key: 'CLIENT_URL',              warn: 'CORS will default to http://localhost:3000' },
  { key: 'DEEPGRAM_API_KEY',        warn: 'Teleprompter mic-sync and TTS will be unavailable' },
  { key: 'DEEPGRAM_PROJECT_ID',     warn: 'Deepgram temp-key generation will fail — set project ID for production' },
  { key: 'GOOGLE_CLIENT_ID',        warn: 'Google sign-in will be unavailable' },
  { key: 'CLERK_SECRET_KEY',        warn: 'Clerk token verification will be unavailable for API authentication' },
  { key: 'ADMIN_USERNAME',          warn: 'Admin dashboard login will be unavailable' },
  { key: 'ADMIN_PASSWORD',          warn: 'Admin dashboard login will be unavailable' },
  { key: 'RAZORPAY_KEY_ID',         warn: 'Payments will be unavailable — set Razorpay credentials' },
  { key: 'RAZORPAY_KEY_SECRET',     warn: 'Payment verification will fail — set RAZORPAY_KEY_SECRET' },
  { key: 'RAZORPAY_WEBHOOK_SECRET', warn: 'Webhook signature verification will fail — set RAZORPAY_WEBHOOK_SECRET' },
  { key: 'SMTP_HOST',               warn: 'Email sending will be unavailable (forgot password, payment receipts, bug reports)' },
  { key: 'SMTP_USER',               warn: 'Email sending will be unavailable (forgot password, payment receipts, bug reports)' },
  { key: 'SMTP_PASS',               warn: 'Email sending will be unavailable (forgot password, payment receipts, bug reports)' },
  { key: 'MAIL_FROM',               warn: 'Outbound emails will not have a configured from address' },
  { key: 'CLIENT_APP_URL',          warn: 'Password reset links will default to CLIENT_URL / localhost' },
] as const;

function countProviderKeys(prefix: 'GROQ' | 'OPENROUTER'): number {
  const found = new Set<string>();

  const csv = process.env[`${prefix}_API_KEYS`]?.trim() || '';
  if (csv) {
    csv.split(',').map((v) => v.trim()).filter(Boolean).forEach((v) => found.add(v));
  }

  const single = process.env[`${prefix}_API_KEY`]?.trim();
  if (single) found.add(single);

  for (let i = 1; i <= 12; i += 1) {
    const numbered = process.env[`${prefix}_API_KEY_${i}`]?.trim()
      || process.env[`${prefix}_API_KEY${i}`]?.trim();
    if (numbered) found.add(numbered);
  }

  return found.size;
}

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

  const groqKeyCount = countProviderKeys('GROQ');
  const openRouterKeyCount = countProviderKeys('OPENROUTER');

  if (groqKeyCount === 0 && openRouterKeyCount === 0) {
    console.warn('⚠️  No GROQ/OPENROUTER API keys found — AI analysis will be unavailable');
  }
  if (groqKeyCount > 0 && groqKeyCount < 4) {
    console.warn(`⚠️  GROQ key pool has ${groqKeyCount} key(s); 4+ recommended for high concurrency`);
  }
  if (openRouterKeyCount > 0 && openRouterKeyCount < 4) {
    console.warn(`⚠️  OPENROUTER key pool has ${openRouterKeyCount} key(s); 4+ recommended for high concurrency`);
  }

  // Validate JWT_SECRET strength
  const jwtSecret = process.env.JWT_SECRET!;
  if (jwtSecret.length < 32) {
    console.warn('⚠️  JWT_SECRET is shorter than 32 characters — consider using a stronger secret in production');
  }

  console.log('✅  Environment variables validated');
}
