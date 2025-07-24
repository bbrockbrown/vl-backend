import express from 'express';
import Stripe from 'stripe';

import * as handlers from '../helpers/stripeHandlers';

let stripe: Stripe;
const stripeHandlers: Record<string, (data: any) => Promise<void>> = {
  // Helper functions depending on Stripe event
  'checkout.session.completed': (data: Stripe.Checkout.Session) =>
    handlers.handleCheckoutSessionCompleted(data),
  'payment_indent.created': (data: Stripe.PaymentIntent) =>
    handlers.handlePaymentIntentCreated(data),
  'payment_intent.succeeded': (data: Stripe.PaymentIntent) =>
    handlers.handlePaymentIntentSucceeded(data),
  'payment_intent.payment_failed': (data: Stripe.PaymentIntent) =>
    handlers.handlePaymentIntentFailed(data),
  'charge.succeeded': (data: Stripe.Charge) => handlers.handleChargeSucceeded(data),
};

// Returns Stripe object to create checkout sessions, etc.
function getStripe(): Stripe {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-06-30.basil',
    });
  }
  return stripe;
}

// Handles all webhook events
export const handleWebhook = async (req: express.Request, res: express.Response) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event: Stripe.Event;

  try {
    // Verify the webhook signature using raw body
    const rawBody = req.body;
    console.log('Webhook raw body type:', typeof rawBody);
    console.log('Webhook raw body length:', rawBody?.length);

    event = getStripe().webhooks.constructEvent(rawBody, sig as string, endpointSecret);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  console.log('Received webhook event:', event.type);

  try {
    const handler = stripeHandlers[event.type as keyof typeof stripeHandlers];
    if (handler) {
      // keeps TS happy
      console.log('Passing in', event.data.object, 'to event handler function');
      await handler(event.data.object as any);
    } else {
      console.log(`Unhandled event type: ${event.type}`);
    }
    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

export const createCheckoutSession = async (req: express.Request, res: express.Response) => {
  const { email, userId } = req.body;

  // Request variable checks
  if (!email || !userId) {
    return res.status(400).json({ message: 'Invalid request for checkout session' });
  }

  try {
    const isProduction = process.env.NODE_ENV === 'production';
    // TODO: change the actual routing of the successURL
    const successUrl = isProduction
      ? `${process.env.FRONTEND_URL}}?stripe-success=true`
      : `${process.env.FRONTEND_URL_DEV}}?stripe-success=true`;
    const cancelUrl = isProduction
      ? `${process.env.FRONTEND_URL}?stripe-success=false`
      : `${process.env.FRONTEND_URL_DEV}}?stripe-success=false`;

    // Get stripe object
    const stripe = getStripe();
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      customer_email: email,
      metadata: {
        email: email,
        user_id: userId,
      },
      mode: 'payment',
    });

    // Return checkoutURL and sessionID
    return res
      .status(200)
      .json({
        checkout_url: session.url,
        session_id: session.id,
      })
      .end();
  } catch (error: any) {
    console.log('Error creating checkout session', error);
    if (error.get('response')) {
      // See if specific Stripe response
      console.log('Stripe response', error.response);
    }
    return res.status(400).json({ error: 'Could not create checkout session' });
  }
};

export const getPaymentStatus = async (req: express.Request, res: express.Response) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID not provided' });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Checkout closed, check payment status
    if (session.status == 'complete') {
      if (session.payment_status === 'paid') {
        // User paid
        return res.status(200).json({
          session_status: 'complete',
          payment_status: 'paid',
        });
      } else if (session.payment_status === 'unpaid') {
        // User did not pay
        return res.status(200).json({
          session_status: 'complete',
          payment_status: 'unpaid',
        });
      }
    }
    // User is still in checkout session
    else if (session.status === 'open') {
      return res.status(200).json({
        session_status: 'open',
        payment_status: 'unpaid',
      });
    }
    // Checkout session no longer valid
    else if (session.status === 'expired') {
      return res.status(200).json({
        session_status: 'expired',
        payment_status: 'unpaid',
      });
    }
    // session.status is null or undefined
    else {
      return res.status(418).json({ error: 'Teapot. Prob never returned #coffeelover' });
    }
  } catch (error) {
    console.log('Error getting payment status');
    return res.status(400).json({ error: 'Could not get payment status' });
  }
};
