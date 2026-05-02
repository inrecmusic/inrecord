// app/api/stripe/checkout/route.js
import { NextResponse } from "next/server";
import Stripe from "stripe";

const PRICE_IDS = {
  fan1:   process.env.STRIPE_PRICE_ID_FAN1,
  fan2:   process.env.STRIPE_PRICE_ID_FAN2,
  early1: process.env.STRIPE_PRICE_ID_EARLY1,
  early2: process.env.STRIPE_PRICE_ID_EARLY2,
  early3: process.env.STRIPE_PRICE_ID_EARLY3,
  full:   process.env.STRIPE_PRICE_ID_FULL,
};

export async function POST(req) {
  const { plan, label } = await req.json();

  if (!plan || !PRICE_IDS[plan]) return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "missing_STRIPE_SECRET_KEY" }, { status: 500 });

  const priceId = PRICE_IDS[plan];
  if (!priceId) return NextResponse.json({ error: `missing_STRIPE_PRICE_ID_${plan.toUpperCase()}` }, { status: 500 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/#pricing`,
      metadata: { plan, label: label || plan },
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe checkout error]", err);
    return NextResponse.json({ error: "stripe_checkout_failed", message: err.message }, { status: 500 });
  }
}
