import Stripe from 'stripe';
import { updateUserById } from '../db/users';

export async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('Checkout session completed:', session.id);

  // Handle successful checkout completion
  // You can access session.customer, session.subscription, session.payment_intent, etc.
  console.log('Payment completed:', session.payment_intent);
}

export async function handlePaymentIntentCreated(paymentIntent: Stripe.PaymentIntent) {
  console.log('Payment Intent created', paymentIntent.id);
}

export async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log('Payment Intent succeeded:', paymentIntent.id);

  // Get user info from metadata
  const { email, userId } = paymentIntent.metadata;
  console.log('paymentIntent metadata', paymentIntent.metadata);
  if (!email || !userId) {
    throw new Error('Did not get metadata from Stripe');
  }

  // Atomic update using updateUserById
  await updateUserById(userId, {
    premium: true,
    'stripe.paymentIntentId': paymentIntent.id,
    'stripe.paymentDate': new Date(),
    'stripe.paymentAmount': paymentIntent.amount,
    'stripe.paymentCurrency': paymentIntent.currency,
  });
  return;
}

export async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log('Payment Intent failed:', paymentIntent.id);

  // Handle failed payment
  // Notify user, update subscription status, etc.
}

export async function handleChargeSucceeded(charge: Stripe.Charge) {
  console.log('Charge succeeded', charge.id);
}
