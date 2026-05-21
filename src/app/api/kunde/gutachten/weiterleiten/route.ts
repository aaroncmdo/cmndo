// Token-Audit-Skip: Email-Generierung via Resend, kein Tailwind.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
// AAR-432: POST /api/kunde/gutachten/weiterleiten
// Erzeugt einen zeit­begrenzten Magic-Link (48h) zum Abruf des Gutachtens und
// verschickt ihn per E-Mail an die vom Kunden angegebene Adresse. Rate-Limit
// 3 Anfragen pro Fall in 24h (Spam-/Enumeration-Schutz).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'
const RATE_LIMIT_PRO_FALL_24H = 3
const MAGIC_LINK_TTL_MS = 48 * 60 * 60 * 1000

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null) as { fall_id?: string; empfaenger_email?: string } | null
    if (!body || !body.fall_id || !body.empfaenger_email) {
      return NextResponse.json({ success: false, error: 'fall_id und empfaenger_email sind Pflicht.' }, { status: 400 })
    }
    const empfaenger = String(body.empfaenger_email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empfaenger)) {
      return NextResponse.json({ success: false, error: 'Ungültige E-Mail-Adresse.' }, { status: 400 })
    }

    // Auth + Ownership
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) {
      return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 })
    }

    const admin = createAdminClient()
    // CMM-44 SP-G PR2: gutachten_eingegangen_am → gutachten.fertiggestellt_am (SSoT).
    const { data: fall } = await admin
      .from('faelle')
      .select('id, kunde_id, lead_id, kennzeichen, claim_id, claims:claim_id(claim_nummer)')
      .eq('id', body.fall_id)
      .maybeSingle()
    if (!fall) {
      return NextResponse.json({ success: false, error: 'Fall nicht gefunden.' }, { status: 404 })
    }

    let owned = fall.kunde_id === user.id
    if (!owned && fall.lead_id) {
      const { data: lead } = await admin.from('leads').select('email').eq('id', fall.lead_id).maybeSingle()
      owned = !!(lead?.email && user.email && lead.email.toLowerCase() === user.email.toLowerCase())
    }
    if (!owned) {
      return NextResponse.json({ success: false, error: 'Keine Berechtigung für diesen Fall.' }, { status: 403 })
    }

    // Gutachten-Existenzcheck über gutachten-Subtabelle (CMM-44 SP-G PR2).
    let fertiggestelltAm: string | null = null
    if (fall.claim_id) {
      const { data: gutachtenRow } = await admin
        .from('gutachten')
        .select('fertiggestellt_am')
        .eq('claim_id', fall.claim_id as string)
        .maybeSingle()
      fertiggestelltAm = gutachtenRow?.fertiggestellt_am ?? null
    }
    if (!fertiggestelltAm) {
      return NextResponse.json(
        { success: false, error: 'Für diesen Fall liegt noch kein Gutachten vor.' },
        { status: 400 },
      )
    }

    // Rate-Limit — letzte 24h
    const seit = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await admin
      .from('kunde_gutachten_requests')
      .select('id', { count: 'exact', head: true })
      .eq('fall_id', fall.id)
      .gte('created_at', seit)
    if ((count ?? 0) >= RATE_LIMIT_PRO_FALL_24H) {
      return NextResponse.json(
        {
          success: false,
          error: `Maximal ${RATE_LIMIT_PRO_FALL_24H} Weiterleitungen pro Fall und 24 Stunden. Bitte später erneut versuchen.`,
        },
        { status: 429 },
      )
    }

    // Token erzeugen und speichern
    const token = (globalThis.crypto?.randomUUID?.() ?? fallbackUuid()) + '-' + (globalThis.crypto?.randomUUID?.() ?? fallbackUuid())
    const expires_at = new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString()

    const { error: insertErr } = await admin.from('kunde_gutachten_requests').insert({
      fall_id: fall.id,
      empfaenger_email: empfaenger,
      magic_link_token: token,
      expires_at,
    })
    if (insertErr) {
      console.error('[AAR-432] Insert kunde_gutachten_requests failed:', insertErr)
      return NextResponse.json({ success: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 })
    }

    const magicUrl = `${APP_URL}/api/kunde/gutachten/magic/${encodeURIComponent(token)}`
    const claim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
    const fallLabel = (fall.kennzeichen as string | null) || (claim?.claim_nummer as string | null) || 'Ihr Fall'

    // Mail schicken (non-critical try/catch, damit der DB-Insert stehen bleibt)
    try {
      const { sendEmail } = await import('@/lib/email/google/client')
      await sendEmail({
        to: empfaenger,
        subject: `Ihr Gutachten zu ${fallLabel}`,
        empfaengerTyp: 'kunde',
        template: 'kunde_gutachten_weiterleitung',
        fallId: fall.id as string,
        html: `
          <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px;">
            <h2 style="color: #0D1B3E;">Ihr Gutachten zum Download</h2>
            <p>Sie haben sich das Gutachten zu ${escapeHtml(fallLabel)} per E-Mail senden lassen.</p>
            <p>Über den folgenden Link können Sie das Dokument innerhalb der nächsten 48 Stunden aufrufen:</p>
            <p style="margin: 24px 0;">
              <a href="${magicUrl}" style="background:#0D1B3E;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Gutachten öffnen</a>
            </p>
            <p style="font-size:12px;color:#6b7280;">Der Link ist 48 Stunden gültig. Bitte leiten Sie ihn nicht weiter — das Gutachten enthält persönliche Daten.</p>
          </div>
        `,
      })
    } catch (mailErr) {
      console.error('[AAR-432] Email-Versand fehlgeschlagen:', mailErr)
      // Wir melden das dem Kunden trotzdem — der Request ist persistiert.
      return NextResponse.json(
        { success: false, error: 'E-Mail konnte nicht zugestellt werden. Bitte später erneut versuchen.' },
        { status: 502 },
      )
    }

    // Timeline-Entry (non-critical)
    try {
      await admin.from('timeline').insert({
        fall_id: fall.id,
        typ: 'system',
        titel: 'Gutachten an Kunde versendet',
        beschreibung: `Magic-Link an ${empfaenger} (48h gültig).`,
      })
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[AAR-432] /api/kunde/gutachten/weiterleiten error:', err)
    return NextResponse.json({ success: false, error: 'Unerwarteter Fehler.' }, { status: 500 })
  }
}

function fallbackUuid(): string {
  // Nur Fallback falls crypto.randomUUID nicht verfügbar ist — sollte in Next 16 nie passieren.
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' : '&#39;',
  )
}
