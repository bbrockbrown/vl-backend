import express from 'express';
import { handleWebhook, createCheckoutSession, getPaymentStatus } from '../controllers/stripe';
import { isAuthenticated } from '../middleware/index';

export default (router: express.Router) => {
  // must use raw body parsing for signature verification
  router.post('/stripe/webhook', express.raw({ type: 'application/json' }), handleWebhook);
  router.post('/stripe/create-checkout-session', isAuthenticated, createCheckoutSession);
  router.get('/stripe/get-payment-status/:sessionId', getPaymentStatus);
};
