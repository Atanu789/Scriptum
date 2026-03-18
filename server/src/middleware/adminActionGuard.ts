import { Request, Response, NextFunction } from 'express';

export function requireAdminActionKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_ACTION_KEY?.trim();
  if (!expected) {
    res.status(500).json({ success: false, error: 'Server misconfigured: ADMIN_ACTION_KEY missing' });
    return;
  }

  const incoming = String(req.headers['x-admin-action-key'] || '').trim();
  if (!incoming || incoming !== expected) {
    res.status(403).json({ success: false, error: 'Invalid admin action key' });
    return;
  }

  next();
}
