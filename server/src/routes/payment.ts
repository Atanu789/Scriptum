import { Router, Request, Response, NextFunction, raw } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getPlans,
  createOrder,
  verifyPayment,
  redeemCode,
  getSubscription,
  getPaymentHistory,
  handleWebhook,
  requestDiscount,
} from '../controllers/paymentController';

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────
router.get('/plans', getPlans);
router.post('/discount-request', requestDiscount);

// ─── Webhook — raw body required for signature verification ──────────────────
router.post(
  '/webhook',
  raw({ type: 'application/json' }),
  (req: Request, _res: Response, next: NextFunction) => {
    // Expose raw body string for signature check in controller
    (req as Request & { rawBody?: string }).rawBody = req.body?.toString('utf8') ?? '';
    next();
  },
  handleWebhook,
);

// ─── Authenticated ────────────────────────────────────────────────────────────
router.use(authenticate);

router.get('/subscription',  getSubscription);
router.get('/history',       getPaymentHistory);
router.post('/create-order', createOrder);
router.post('/verify',       verifyPayment);
router.post('/redeem',       redeemCode);

export default router;
