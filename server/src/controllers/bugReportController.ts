import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../utils/email';
import { JwtPayload } from '../types';

const BUG_REPORT_RECIPIENTS = ['atanugm8@gmail.com', 'gdnvision360@gmail.com'];

export const reportBugValidation = [
  body('description')
    .trim()
    .isLength({ min: 10, max: 4000 })
    .withMessage('Issue description must be between 10 and 4000 characters'),
  body('page').trim().isLength({ min: 1, max: 300 }).withMessage('Page is required'),
  body('screenshot').optional().isString().isLength({ max: 2000000 }),
];

function getReporterFromAuthHeader(authHeader?: string): { userId?: string; email?: string } {
  if (!authHeader?.startsWith('Bearer ')) return {};
  const token = authHeader.slice('Bearer '.length).trim();
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return {};

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    return { userId: payload.userId, email: payload.email };
  } catch {
    return {};
  }
}

export async function reportBug(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, error: errors.array()[0].msg });
    return;
  }

  const { description, page, screenshot } = req.body as {
    description: string;
    page: string;
    screenshot?: string;
  };

  const reporter = getReporterFromAuthHeader(req.headers.authorization);
  const nowIso = new Date().toISOString();

  const text = [
    'Bug Report Submitted',
    '',
    `Date: ${nowIso}`,
    `Page: ${page}`,
    `Reporter Email: ${reporter.email || 'unknown'}`,
    `Reporter User ID: ${reporter.userId || 'unknown'}`,
    '',
    'Description:',
    description,
    '',
    screenshot ? `Screenshot: ${screenshot.slice(0, 5000)}${screenshot.length > 5000 ? '...<truncated>' : ''}` : 'Screenshot: not provided',
  ].join('\n');

  const emailResult = await sendEmail({
    to: BUG_REPORT_RECIPIENTS,
    subject: `Bug Report - ${page}`,
    text,
    html: `<pre style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif">${text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</pre>`,
  });

  if (!emailResult.sent) {
    console.warn('Bug report email failed:', emailResult.reason || 'unknown');
  }

  res.json({ success: true, message: 'Bug report submitted. Thank you!' });
}
