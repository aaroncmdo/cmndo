import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/lexoffice/sync — Lexoffice Zahlungseingang-Abgleich.
// Env: LEXOFFICE_API_KEY. Ohne Key: graceful skip.

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.LEXOFFICE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'LEXOFFICE_API_KEY nicht gesetzt' })
  }

  const db = createAdminClient()
  let matched = 0

  try {
    const resp = await fetch('https://api.lexoffice.io/v1/voucherlist?voucherType=invoice&voucherStatus=open&size=100', {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    })
    if (!resp.ok) return NextResponse.json({ ok: false, error: `Lexoffice API ${resp.status}` })

    const data = await resp.json()
    for (const inv of data.content ?? []) {
      if (inv.voucherStatus === 'paid') {
        const { data: abr } = await db
          .from('abrechnungen')
          .select('id')
          .ilike('abrechnungs_nr', `%${inv.voucherNumber ?? ''}%`)
          .eq('status', 'versendet')
          .maybeSingle()
        if (abr) {
          await db.from('abrechnungen').update({ status: 'bezahlt', bezahlt_am: new Date().toISOString() }).eq('id', abr.id)
          matched++
        }
      }
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) })
  }

  return NextResponse.json({ ok: true, matched })
}
