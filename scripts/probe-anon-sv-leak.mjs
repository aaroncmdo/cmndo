#!/usr/bin/env node
// Probe: beweist, dass die anon-RLS-Policy `sachverstaendige_anon_select_map_ready`
// sensible Spalten (gcal_*-Token, stripe_customer_id, ust_id, steuernummer) an
// ANONYME Nutzer ausliefert. RLS ist zeilenbasiert -> die Policy gibt GANZE Zeilen
// frei, nicht nur die fuer die oeffentliche Karte noetigen Spalten.
//
// Kontext: Audit 01.06.2026 (docs/01.06.2026/personal-audit-anlage-abrechnung.md),
// Befund HIGH-1. Spalten-REVOKE wirkt in diesem Setup nicht (table-GRANT, s. Memory).
//
// Nutzung (NUR anon/publishable Key, NIEMALS service_role):
//   PowerShell:  $env:SUPABASE_URL="https://<ref>.supabase.co"; $env:SUPABASE_ANON_KEY="<key>"; node scripts/probe-anon-sv-leak.mjs
//   bash:        SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/probe-anon-sv-leak.mjs
// Liest alternativ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
//
// Read-only. Gibt KEINE vollstaendigen Tokenwerte aus (nur PRESENT + Laenge + letzte 4).

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const anon =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY

if (!url || !anon) {
  console.error('FEHLT: SUPABASE_URL und/oder SUPABASE_ANON_KEY (bzw. NEXT_PUBLIC_*).')
  process.exit(2)
}

const redact = (v) =>
  v == null ? null : `PRESENT(len=${String(v).length}, ...${String(v).slice(-4)})`

const sb = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const main = async () => {
  console.log('=== Probe: anon-Zugriff auf sachverstaendige ===')
  console.log('URL      :', url)
  console.log(
    'Key-Typ  :',
    anon.startsWith('sb_publishable_')
      ? 'publishable'
      : anon.startsWith('eyJ')
        ? 'legacy-anon-JWT'
        : 'unbekannt',
  )
  console.log('Session  : KEINE (Postgres-Rolle: anon)\n')

  // [1] Sensible Spalten als anon ziehen — genau das, was ein Website-Besucher mit dem
  //     publishable Key im Browser tun kann.
  const sensitive = [
    'gcal_refresh_token',
    'gcal_access_token',
    'stripe_customer_id',
    'ust_id',
    'steuernummer',
    'unterschrift_url',
  ]
  const { data, error } = await sb
    .from('sachverstaendige')
    .select(['id', ...sensitive, 'standort_lat', 'standort_lng'].join(', '))

  if (error) {
    console.log('[1] SELECT sensibler Spalten -> FEHLER (gut, falls Grant/Policy schuetzt):')
    console.log('    ', error.code, '-', error.message)
  } else {
    console.log(`[1] anon konnte ${data.length} sachverstaendige-Zeile(n) lesen.`)
    const agg = Object.fromEntries(sensitive.map((k) => [k, 0]))
    for (const r of data) for (const k of sensitive) if (r[k] != null) agg[k]++
    console.log('    Nicht-NULL sensible Felder ueber alle anon-sichtbaren Zeilen:')
    console.table(agg)

    const leaky = data.filter((r) =>
      sensitive.some((k) => r[k] != null && k !== 'unterschrift_url'),
    )
    if (leaky.length) {
      console.log(`\n    LEAK BESTAETIGT — ${leaky.length} Zeile(n) mit sensiblen Werten, anon-lesbar:`)
      for (const r of leaky.slice(0, 5)) {
        console.log('     -', r.id, {
          gcal_refresh_token: redact(r.gcal_refresh_token),
          gcal_access_token: redact(r.gcal_access_token),
          stripe_customer_id: r.stripe_customer_id ?? null,
          ust_id: r.ust_id ?? null,
          steuernummer: r.steuernummer ?? null,
        })
      }
    } else {
      console.log('\n    Aktuell kein sensibler Wert in anon-sichtbaren Zeilen befuellt — die Policy-FORM bleibt aber das Risiko (jeder neue Token/Stripe-Wert wird sofort anon-lesbar).')
    }
  }

  // [2] Kontrolle: profiles hat KEINE anon-Policy -> sollte leer/blocked sein.
  const { data: p, error: pe } = await sb
    .from('profiles')
    .select('id, email, gehalt_brutto')
    .limit(5)
  console.log(
    `\n[2] Kontrolle profiles als anon: ${pe ? 'FEHLER ' + pe.code : (p?.length ?? 0) + ' Zeilen'} (erwartet: 0 / blocked)`,
  )

  console.log(
    '\nFazit: Liefert [1] Zeilen mit PRESENT-Token / Stripe-ID / USt-ID, ist die anon-Map-Policy ein Daten-Leak auf Spalten-Ebene.',
  )
}

main().catch((e) => {
  console.error('Unerwarteter Fehler:', e)
  process.exit(1)
})
