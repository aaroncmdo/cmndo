import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { categories?: unknown; policyVersion?: unknown }
    const categories = Array.isArray(body.categories) ? body.categories.map(String) : []
    const policyVersion = typeof body.policyVersion === 'string' ? body.policyVersion : 'unknown'
    const ua = (req.headers.get('user-agent') ?? '').slice(0, 300)
    const supabase = createAdminClient()
    const { error } = await supabase.from('consent_records').insert({ categories, policy_version: policyVersion, user_agent: ua })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 200 })
  }
}
