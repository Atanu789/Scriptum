import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import User from '../models/User';
import { generateToken } from '../utils/jwt';
import { ApiResponse } from '../types';

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
