import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createClerkClient, verifyToken } from '@clerk/backend';
import User from '../models/User';
import { AuthenticatedRequest, JwtPayload } from '../types';

let clerkClientCache: ReturnType<typeof createClerkClient> | null = null;

function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;

  if (!clerkClientCache) {
    clerkClientCache = createClerkClient({ secretKey });
  }

  return clerkClientCache;
}

function extractPrimaryEmail(clerkUser: {
  primaryEmailAddressId?: string | null;
  emailAddresses?: Array<{ id: string; emailAddress: string }>;
}): string | null {
  const emailAddresses = clerkUser.emailAddresses || [];
  if (emailAddresses.length === 0) return null;

  const primary = clerkUser.primaryEmailAddressId
    ? emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId)
    : null;

  return (primary?.emailAddress || emailAddresses[0]?.emailAddress || '').trim().toLowerCase() || null;
}

async function findOrCreateLocalUserFromClerk(clerkUserId: string, emailHint?: string, nameHint?: string) {
  const clerkClient = getClerkClient();
  if (!clerkClient) {
    throw new Error('CLERK_SECRET_KEY not configured');
  }

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const email = extractPrimaryEmail(clerkUser) || emailHint?.trim().toLowerCase() || null;

  if (!email) {
    throw new Error('Clerk user has no email address');
  }

  const displayName = [clerkUser.firstName?.trim(), clerkUser.lastName?.trim()]
    .filter(Boolean)
    .join(' ')
    .trim() || clerkUser.username || nameHint || email.split('@')[0] || 'User';

  let user = await User.findOne({ clerkId: clerkUserId });
  if (!user) {
    user = await User.findOne({ email });
  }

  if (!user) {
    user = await User.create({
      clerkId: clerkUserId,
      email,
      name: displayName,
      password: crypto.randomBytes(32).toString('hex'),
    });
  } else {
    let changed = false;
    if (user.clerkId !== clerkUserId) {
      user.clerkId = clerkUserId;
      changed = true;
    }
    if (user.email !== email) {
      user.email = email;
      changed = true;
    }
    if ((!user.name || user.name === 'User') && displayName) {
      user.name = displayName;
      changed = true;
    }
    if (changed) {
      await user.save();
    }
  }

  return {
    userId: user._id.toString(),
    email: user.email,
  };
}

export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'No token provided. Authorization denied.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  const jwtSecret = process.env.JWT_SECRET;

  // Backward compatibility: accept existing JWT tokens first.
  if (jwtSecret) {
    try {
      const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
      req.user = decoded;
      next();
      return;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        res.status(401).json({ success: false, error: 'Token has expired' });
        return;
      }
      // If JWT verification fails, continue to Clerk verification below.
    }
  }

  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }

  (async () => {
    try {
      const verified = await verifyToken(token, { secretKey: clerkSecretKey });
      const claims = verified as { sub?: string; email?: string; email_address?: string; name?: string };
      const clerkUserId = claims.sub?.trim();

      if (!clerkUserId) {
        res.status(401).json({ success: false, error: 'Invalid Clerk token' });
        return;
      }

      const mapped = await findOrCreateLocalUserFromClerk(
        clerkUserId,
        claims.email || claims.email_address,
        claims.name,
      );

      req.user = {
        userId: mapped.userId,
        email: mapped.email,
        role: 'user',
      };

      next();
    } catch {
      res.status(401).json({ success: false, error: 'Invalid token' });
    }
  })().catch(() => {
    res.status(500).json({ success: false, error: 'Token verification failed' });
  });
};
