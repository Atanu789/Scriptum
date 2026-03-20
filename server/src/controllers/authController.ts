import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import User from '../models/User';
import { generateToken } from '../utils/jwt';
import { ApiResponse } from '../types';
import { sendEmail } from '../utils/email';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── Register ─────────────────────────────────────────────────────────────────

export const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number'),
];

export const register = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const { name, email, password } = req.body as { name: string; email: string; password: string };

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ success: false, error: 'An account with this email already exists' });
      return;
    }

    const user = await User.create({ name, email, password });

    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
    });

    const response: ApiResponse = {
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
        },
      },
      message: 'Account created successfully',
    };

    res.status(201).json(response);
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
};

// ─── Login ─────────────────────────────────────────────────────────────────────

export const loginValidation = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

export const googleAuthValidation = [
  body('idToken').trim().notEmpty().withMessage('Google idToken is required'),
];

export const forgotPasswordValidation = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
];

export const resetPasswordValidation = [
  body('token').trim().isLength({ min: 20 }).withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number'),
];

export const login = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const { email, password } = req.body as { email: string; password: string };

  try {
    // Explicitly select password for this query
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
        },
      },
      message: 'Login successful',
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
};

// ─── Google Login / Register ────────────────────────────────────────────────

export const googleAuth = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const { idToken } = req.body as { idToken: string };

  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(503).json({ success: false, error: 'Google sign-in is not configured on server' });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase().trim();
    const name = payload?.name?.trim() || 'Google User';
    const googleSub = payload?.sub;

    if (!email || !googleSub || payload?.email_verified !== true) {
      res.status(401).json({ success: false, error: 'Google account could not be verified' });
      return;
    }

    let user = await User.findOne({ email }).select('+password');

    if (!user) {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      user = await User.create({
        name,
        email,
        password: randomPassword,
      });
    } else if (!user.name || user.name === 'User') {
      user.name = name;
      await user.save();
    }

    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
    });

    const response: ApiResponse = {
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
        },
      },
      message: 'Google login successful',
    };

    res.json(response);
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ success: false, error: 'Google authentication failed' });
  }
};

// ─── Me ───────────────────────────────────────────────────────────────────────

export const getMe = async (req: Request & { user?: { userId: string } }, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('getMe error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
};

// ─── Forgot / Reset Password ───────────────────────────────────────────────

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const { email } = req.body as { email: string };

  try {
    const user = await User.findOne({ email }).select('+resetPasswordToken +resetPasswordExpiresAt');
    if (!user) {
      res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpiresAt = expiresAt;
    await user.save();

    const baseUrl = (process.env.CLIENT_APP_URL || process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim();
    const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const emailResult = await sendEmail({
      to: user.email,
      subject: 'Reset your password',
      text: `Reset your password:\n${resetLink}`,
      html: `<p>Reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p>`,
    });

    if (!emailResult.sent) {
      console.warn('Forgot password email failed:', emailResult.reason || 'unknown');
    }

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, error: 'Failed to process forgot password request' });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const { token, password } = req.body as { token: string; password: string };

  try {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpiresAt: { $gt: new Date() },
    }).select('+password +resetPasswordToken +resetPasswordExpiresAt');

    if (!user) {
      res.status(400).json({ success: false, error: 'Reset token is invalid or expired' });
      return;
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpiresAt = null;
    await user.save();

    res.json({ success: true, message: 'Password reset successful. Please sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Could not reset password' });
  }
};
