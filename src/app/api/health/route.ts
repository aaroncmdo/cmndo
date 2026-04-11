import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Lightweight ping for offline-detection (no DB query)
export async function HEAD() {
  return new Response(null, { status: 200 })
}

export async function GET() {
  const checks: Record<string, 'ok' | 'fail' | 'skipped'> = {}

  // Supabase
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { error } = await supabase.from('profiles').select('id').limit(1)
    checks.supabase = error ? 'fail' : 'ok'
  } catch {
    checks.supabase = 'fail'
  }

  // Stripe
  try {
    if (process.env.STRIPE_SECRET_KEY) {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      await stripe.balance.retrieve()
      checks.stripe = 'ok'
    } else {
      checks.stripe = 'skipped'
    }
  } catch {
    checks.stripe = 'fail'
  }

  // Email
  checks.email = process.env.RESEND_API_KEY ? 'ok' : 'skipped'

  const allOk = Object.values(checks).every(v => v === 'ok' || v === 'skipped')

  return NextResponse.json(
    { status: allOk ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  )
}
