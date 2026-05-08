/**
 * e2e-rls-check.mjs — RLS-Sichtbarkeits-Matrix-Prüfung pro Rolle
 *
 * Dieses Skript verifiziert, dass die Supabase Row-Level-Security (RLS)
 * für jede der 5 Test-Rollen genau die Daten sichtbar macht, die laut
 * Spezifikation (docs/portals-review/SMOKE-PLAN-FULL-E2E.md §4.2)
 * erwartet werden — nicht mehr, nicht weniger.
 *
 * Methode:
 *  1. Für jede Test-Rolle: signInWithPassword() → access_token
 *  2. User-Client mit Bearer-Header bauen → RLS respektiert auth.uid()
 *  3. SELECT count(*) auf jeder relevanten Tabelle ausführen
 *  4. Ergebnis gegen Erwartungs-Matrix klassifizieren (✅ / ⚠️ / ❌)
 *  5. Ausgabe als Markdown-Tabelle nach docs/portals-review/RLS-MATRIX.md
 *
 * Voraussetzung:
 *  - node scripts/e2e-reset.mjs + e2e-seed-fixtures.mjs wurden zuvor gefahren
 *  - Mindestens 2 Leads, je ein Test-User pro Rolle existieren in der DB
 *  - .env.local enthält NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Ausführung:
 *  node scripts/e2e-rls-check.mjs
 *
 * Non-destructive: nur SELECT-Abfragen, kein INSERT/UPDATE/DELETE.
 * Idempotent: mehrfaches Ausführen überschreibt RLS-MATRIX.md ohne Seiteneffekte.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projektRoot = join(__dirname, '..')

// ─── ENV laden ─────────────────────────────────────────────────────────────

function ladeEnv() {
  const envPfad = join(projektRoot, '.env.local')
  if (!existsSync(envPfad)) {
    console.error('[FEHLER] .env.local nicht gefunden unter:', envPfad)
    process.exit(1)
  }
  const zeilen = readFileSync(envPfad, 'utf-8').split('\n')
  for (const zeile of zeilen) {
    const bereinigt = zeile.trim()
    if (!bereinigt || bereinigt.startsWith('#')) continue
    const gleichPos = bereinigt.indexOf('=')
    if (gleichPos === -1) continue
    const schluessel = bereinigt.slice(0, gleichPos).trim()
    const wert = bereinigt.slice(gleichPos + 1).trim()
    if (!process.env[schluessel]) {
      process.env[schluessel] = wert
    }
  }
}

ladeEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.error(
    '[FEHLER] NEXT_PUBLIC_SUPABASE_URL oder NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen in .env.local',
  )
  process.exit(1)
}

// ─── Test-Rollen Konfiguration ──────────────────────────────────────────────

const TEST_ROLLEN = [
  { rolle: 'kunde',        email: 'test-kunde@claimondo.de',    passwort: 'Test1234!' },
  { rolle: 'sv',           email: 'test-sv@claimondo.de',       passwort: 'Test1234!' },
  { rolle: 'dispatch',     email: 'test-dispatch@claimondo.de', passwort: 'Test1234!' },
  { rolle: 'admin',        email: 'test-admin@claimondo.de',    passwort: 'Test1234!' },
  { rolle: 'kb',           email: 'test-kb@claimondo.de',       passwort: 'Test1234!' },
]

// ─── Tabellen die geprüft werden ─────────────────────────────────────────────

const TABELLEN = [
  'faelle',
  'claims',
  'auftraege',
  'leads',
  'gutachter_termine',
  'mitteilungen',
  'nachrichten',
  'abrechnungen',
  'dokumente',
  'profiles',
  'sachverstaendige',
  'partner_provisionen',
  'provisionen_maik',
  'makler_provisionen',
  'timeline',
  'pflicht_kategorien',
  'lexdrive_events',
  'sv_tages_session',
]

// ─── Erwartungs-Matrix (aus §4.2 des Smoke-Plans) ─────────────────────────
//
// Mögliche Erwartungs-Werte:
//   'alle'        → COUNT > 0 erwartet (RLS erlaubt Zugriff auf alles)
//   'nur_eigene'  → COUNT ≥ 0, aber wir können nicht ohne Cross-Compare
//                   sicherstellen ob es wirklich nur eigene sind → ⚠️
//   'zugewiesen'  → wie 'nur_eigene' — Subset, manuell zu prüfen → ⚠️
//   'null'        → COUNT muss exakt 0 sein (kein Zugriff erlaubt)
//   'skip'        → Tabelle existiert nicht für diese Rolle (nicht prüfbar)
//   'grob'        → Grobe Liste ohne PII — COUNT > 0 OK, Inhalt manuell → ⚠️
//
// Format: ERWARTUNGS_MATRIX[tabelle][rolle] = Erwartungs-Wert

const ERWARTUNGS_MATRIX = {
  faelle: {
    kunde:    'nur_eigene',
    sv:       'nur_eigene',   // zugewiesene Fälle (sv_id = auth.uid())
    dispatch: 'alle',
    admin:    'alle',
    kb:       'alle',         // KB: alle (read) laut Matrix
  },
  claims: {
    // claims ist der CMM-Sync-Spiegel von faelle — gleiche RLS-Erwartung
    kunde:    'nur_eigene',
    sv:       'nur_eigene',
    dispatch: 'alle',
    admin:    'alle',
    kb:       'alle',
  },
  auftraege: {
    kunde:    'nur_eigene',
    sv:       'nur_eigene',
    dispatch: 'alle',
    admin:    'alle',
    kb:       'alle',
  },
  leads: {
    kunde:    'null',
    sv:       'null',
    dispatch: 'alle',
    admin:    'alle',
    kb:       'zugewiesen',   // KB sieht nur zugewiesene Leads
  },
  gutachter_termine: {
    kunde:    'nur_eigene',   // Termine des eigenen Falls
    sv:       'nur_eigene',   // Eigene Termine (sv_id)
    dispatch: 'alle',
    admin:    'alle',
    kb:       'alle',
  },
  mitteilungen: {
    kunde:    'nur_eigene',
    sv:       'nur_eigene',
    dispatch: 'nur_eigene',
    admin:    'nur_eigene',
    kb:       'nur_eigene',
  },
  nachrichten: {
    kunde:    'nur_eigene',
    sv:       'nur_eigene',
    dispatch: 'alle',
    admin:    'alle',
    kb:       'alle',
  },
  abrechnungen: {
    kunde:    'null',
    sv:       'nur_eigene',
    dispatch: 'null',
    admin:    'alle',
    kb:       'null',
  },
  dokumente: {
    kunde:    'nur_eigene',
    sv:       'nur_eigene',
    dispatch: 'alle',
    admin:    'alle',
    kb:       'alle',
  },
  profiles: {
    // profiles enthält alle Rollen — RLS meist: eigenes Profil + eingeschränkte Sicht
    kunde:    'nur_eigene',
    sv:       'grob',         // SV sieht andere SVs grob (für Verfügbarkeits-Check)
    dispatch: 'alle',
    admin:    'alle',
    kb:       'alle',
  },
  sachverstaendige: {
    kunde:    'null',
    sv:       'grob',         // Eigenes Profil + grobe Liste anderer SVs
    dispatch: 'grob',
    admin:    'alle',
    kb:       'null',
  },
  partner_provisionen: {
    kunde:    'null',
    sv:       'null',
    dispatch: 'null',
    admin:    'alle',
    kb:       'null',
  },
  provisionen_maik: {
    // Alias / separate Tabelle für Maik-spezifische Provisionen
    kunde:    'null',
    sv:       'null',
    dispatch: 'null',
    admin:    'alle',
    kb:       'null',
  },
  makler_provisionen: {
    kunde:    'null',
    sv:       'null',
    dispatch: 'null',
    admin:    'alle',
    kb:       'null',
  },
  timeline: {
    kunde:    'nur_eigene',
    sv:       'nur_eigene',
    dispatch: 'alle',
    admin:    'alle',
    kb:       'alle',
  },
  pflicht_kategorien: {
    // Laut Plan §4.3: RLS für Kunde hier unklar — vermutlich kein Zugriff
    kunde:    'null',         // ⚠️ vermutlich fehlende RLS-Policy — erwartetes Finding
    sv:       'nur_eigene',
    dispatch: 'alle',
    admin:    'alle',
    kb:       'alle',
  },
  lexdrive_events: {
    kunde:    'null',
    sv:       'null',
    dispatch: 'alle',
    admin:    'alle',
    kb:       'null',
  },
  sv_tages_session: {
    kunde:    'null',
    sv:       'nur_eigene',
    dispatch: 'alle',
    admin:    'alle',
    kb:       'null',
  },
}

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

/**
 * Baut einen Supabase-Client der als der angegebene User agiert
 * und damit RLS via auth.uid() respektiert.
 */
function bauUserClient(accessToken) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Einmal-Client für Auth-Operationen (kein persistierter Session-State).
 */
function bauAnonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Gibt den Status-Emoji für einen gegebenen Count + Erwartungs-Wert zurück.
 * Außerdem einen kurzen Kommentar.
 */
function klassifiziere(erwartung, count) {
  if (erwartung === 'alle') {
    if (count > 0) return { status: '✅', kommentar: '' }
    // Count = 0 obwohl Daten da sein müssten (nach Seed)
    return { status: '❌', kommentar: 'Count=0 obwohl Seed-Daten erwartet — RLS blockiert?' }
  }

  if (erwartung === 'null') {
    if (count === 0) return { status: '✅', kommentar: '' }
    return { status: '❌', kommentar: `RLS-Leak! Count=${count} statt 0` }
  }

  if (erwartung === 'nur_eigene' || erwartung === 'zugewiesen') {
    if (count > 0) {
      return {
        status: '⚠️',
        kommentar: 'Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar',
      }
    }
    // Count = 0 bei "nur_eigene" ist ambivalent: entweder RLS greift korrekt (keine eigenen Daten)
    // oder Seed-Daten fehlen. Markieren als Warnung, da Seed-Fixtures vorhanden sein sollten.
    return {
      status: '⚠️',
      kommentar: 'Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)',
    }
  }

  if (erwartung === 'grob') {
    if (count > 0) {
      return {
        status: '⚠️',
        kommentar: 'Grobe Liste sichtbar — Inhalt (keine PII?) manuell prüfen',
      }
    }
    return { status: '❌', kommentar: 'Count=0 — grobe Liste sollte sichtbar sein' }
  }

  return { status: '⚠️', kommentar: `Unbekannte Erwartung: ${erwartung}` }
}

// ─── Haupt-Logik ─────────────────────────────────────────────────────────────

async function pruefeRolle(rollenKonfig) {
  const { rolle, email, passwort } = rollenKonfig
  const anonClient = bauAnonClient()

  // 1. Login
  const { data: authData, error: loginFehler } = await anonClient.auth.signInWithPassword({
    email,
    password: passwort,
  })

  if (loginFehler || !authData?.session?.access_token) {
    console.error(`  [HARD-BLOCKER] Login fehlgeschlagen für ${email}:`, loginFehler?.message ?? 'Kein Token')
    return {
      rolle,
      email,
      loginOk: false,
      fehler: loginFehler?.message ?? 'Kein access_token erhalten',
      ergebnisse: [],
    }
  }

  const { access_token } = authData.session
  const userClient = bauUserClient(access_token)

  console.log(`  ✓ Login OK für ${rolle} (${email})`)

  const ergebnisse = []

  // 2. Pro Tabelle: COUNT abfragen
  for (const tabelle of TABELLEN) {
    // Überspringe doppelte "abrechnungen" (im Plan zweimal gelistet)
    if (ergebnisse.some(e => e.tabelle === tabelle)) continue

    let count = null
    let existiert = true
    let fehler = null

    try {
      const { count: cnt, error } = await userClient
        .from(tabelle)
        .select('*', { count: 'exact', head: true })

      if (error) {
        // Wenn Tabelle nicht existiert (42P01) → skip
        if (
          error.code === '42P01' ||
          error.message?.includes('does not exist') ||
          error.message?.includes('relation') ||
          error.code === 'PGRST200'
        ) {
          existiert = false
        } else {
          // Anderer Fehler (z.B. RLS verweigert komplett und Supabase gibt Error zurück)
          fehler = error.message
          count = 0 // Behandle als 0 für Klassifizierung
        }
      } else {
        count = cnt ?? 0
      }
    } catch (ausnahme) {
      fehler = ausnahme?.message ?? String(ausnahme)
      count = 0
    }

    if (!existiert) {
      ergebnisse.push({
        tabelle,
        erwartung: ERWARTUNGS_MATRIX[tabelle]?.[rolle] ?? '?',
        count: null,
        status: '–',
        kommentar: 'Tabelle existiert nicht in DB — Skip',
        existiert: false,
      })
      continue
    }

    const erwartung = ERWARTUNGS_MATRIX[tabelle]?.[rolle] ?? 'unbekannt'
    const { status, kommentar: klassKommentar } = klassifiziere(erwartung, count ?? 0)

    ergebnisse.push({
      tabelle,
      erwartung,
      count: count ?? 0,
      status,
      kommentar: fehler ? `DB-Fehler: ${fehler}` : klassKommentar,
      existiert: true,
    })
  }

  // Session aufräumen
  await anonClient.auth.signOut()

  return { rolle, email, loginOk: true, fehler: null, ergebnisse }
}

async function hauptProgramm() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  e2e-rls-check.mjs — RLS-Sichtbarkeits-Matrix-Prüfung')
  console.log(`  Datum: ${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE')}`)
  console.log('═══════════════════════════════════════════════════════\n')

  const alleErgebnisse = []
  const hardBlocker = []

  for (const rollenKonfig of TEST_ROLLEN) {
    console.log(`\n▶ Prüfe Rolle: ${rollenKonfig.rolle} (${rollenKonfig.email})`)
    const ergebnis = await pruefeRolle(rollenKonfig)
    alleErgebnisse.push(ergebnis)

    if (!ergebnis.loginOk) {
      hardBlocker.push({
        rolle: ergebnis.rolle,
        email: ergebnis.email,
        fehler: ergebnis.fehler,
      })
      console.error(`  [HARD-BLOCKER] Rolle ${ergebnis.rolle} nicht testbar — überspringe`)
      // Hard-Blocker: melde, mach nicht weiter MIT DIESER ROLLE, aber prüfe andere Rollen
    } else {
      const gesamtIssues = ergebnis.ergebnisse.filter(e => e.status === '❌' || e.status === '⚠️')
      console.log(`  ${ergebnis.ergebnisse.length} Tabellen geprüft — ${gesamtIssues.length} Issue(s) gefunden`)
    }
  }

  // ─── Markdown-Report generieren ──────────────────────────────────────────

  const zeitstempel = new Date().toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const zeilen = []

  zeilen.push('# RLS-Sichtbarkeits-Matrix')
  zeilen.push('')
  zeilen.push(`**Generiert:** ${zeitstempel}  `)
  zeilen.push('**Skript:** `scripts/e2e-rls-check.mjs`  ')
  zeilen.push('**Grundlage:** `docs/portals-review/SMOKE-PLAN-FULL-E2E.md` §4.2')
  zeilen.push('')
  zeilen.push('> Non-destructive — nur SELECT-Abfragen. Seed-Voraussetzung:')
  zeilen.push('> `e2e-reset.mjs` + `e2e-seed-fixtures.mjs` müssen vorher gelaufen sein.')
  zeilen.push('')

  // ─── Hard-Blocker Warnung ─────────────────────────────────────────────────

  if (hardBlocker.length > 0) {
    zeilen.push('## ⛔ Hard-Blocker — Login fehlgeschlagen')
    zeilen.push('')
    zeilen.push('Die folgenden Rollen konnten sich nicht einloggen. RLS-Prüfung für diese Rollen')
    zeilen.push('ist nicht möglich. Test-User müssen in `auth.users` vorhanden sein mit Passwort `Test1234!`.')
    zeilen.push('')
    for (const blocker of hardBlocker) {
      zeilen.push(`- **${blocker.rolle}** (\`${blocker.email}\`): ${blocker.fehler}`)
    }
    zeilen.push('')
  }

  // ─── Found Issues Summary ─────────────────────────────────────────────────

  const alleIssues = []
  for (const ergebnis of alleErgebnisse) {
    if (!ergebnis.loginOk) continue
    for (const e of ergebnis.ergebnisse) {
      if (e.status === '❌' || e.status === '⚠️') {
        alleIssues.push({ rolle: ergebnis.rolle, ...e })
      }
    }
  }

  const fehlerIssues = alleIssues.filter(i => i.status === '❌')
  const warnIssues = alleIssues.filter(i => i.status === '⚠️')

  zeilen.push('## Zusammenfassung')
  zeilen.push('')
  zeilen.push(
    `| Klassifizierung | Anzahl |`,
  )
  zeilen.push('|---|---|')
  zeilen.push(`| ❌ Fehler (RLS-Leak oder blockiert) | ${fehlerIssues.length} |`)
  zeilen.push(`| ⚠️ Warnung (manuelle Kontrolle nötig) | ${warnIssues.length} |`)
  zeilen.push(`| ✅ OK | ${alleIssues.length === 0 ? (alleErgebnisse.reduce((s, r) => s + (r.ergebnisse?.length ?? 0), 0) - alleIssues.length) : (alleErgebnisse.reduce((s, r) => s + (r.ergebnisse?.length ?? 0), 0) - alleIssues.length)} |`)
  zeilen.push(`| – Tabelle nicht vorhanden | ${alleErgebnisse.reduce((s, r) => s + (r.ergebnisse?.filter(e => e.status === '–').length ?? 0), 0)} |`)
  zeilen.push('')

  if (fehlerIssues.length > 0 || hardBlocker.length > 0) {
    zeilen.push('## ❌ Gefundene Fehler')
    zeilen.push('')
    if (hardBlocker.length > 0) {
      for (const blocker of hardBlocker) {
        zeilen.push(`- **[HARD-BLOCKER]** Rolle \`${blocker.rolle}\` — Login fehlgeschlagen: ${blocker.fehler}`)
      }
    }
    for (const issue of fehlerIssues) {
      zeilen.push(
        `- **Rolle \`${issue.rolle}\`, Tabelle \`${issue.tabelle}\`** — Erwartet: \`${issue.erwartung}\`, Count: ${issue.count} — ${issue.kommentar}`,
      )
    }
    zeilen.push('')
  }

  if (warnIssues.length > 0) {
    zeilen.push('## ⚠️ Warnungen (manuelle Kontrolle erforderlich)')
    zeilen.push('')
    for (const issue of warnIssues) {
      zeilen.push(
        `- **Rolle \`${issue.rolle}\`, Tabelle \`${issue.tabelle}\`** — Count: ${issue.count} — ${issue.kommentar}`,
      )
    }
    zeilen.push('')
  }

  // ─── Pro-Rollen-Tabellen ──────────────────────────────────────────────────

  zeilen.push('---')
  zeilen.push('')
  zeilen.push('## Detail-Tabellen pro Rolle')
  zeilen.push('')

  for (const ergebnis of alleErgebnisse) {
    zeilen.push(`### Rolle: \`${ergebnis.rolle}\` (${ergebnis.email})`)
    zeilen.push('')

    if (!ergebnis.loginOk) {
      zeilen.push(`> ⛔ **Hard-Blocker** — Login fehlgeschlagen: ${ergebnis.fehler}`)
      zeilen.push('')
      zeilen.push('Keine RLS-Prüfung möglich.')
      zeilen.push('')
      continue
    }

    zeilen.push('| Tabelle | Erwartet | Ist (Count) | Status | Kommentar |')
    zeilen.push('|---|---|---|---|---|')

    for (const e of ergebnis.ergebnisse) {
      const countAnzeige = e.existiert ? String(e.count) : 'n/a'
      const erwartungAnzeige = e.existiert ? `\`${e.erwartung}\`` : '–'
      const kommentarAnzeige = e.kommentar || '–'
      zeilen.push(
        `| \`${e.tabelle}\` | ${erwartungAnzeige} | ${countAnzeige} | ${e.status} | ${kommentarAnzeige} |`,
      )
    }

    zeilen.push('')
  }

  // ─── Legende ─────────────────────────────────────────────────────────────

  zeilen.push('---')
  zeilen.push('')
  zeilen.push('## Legende')
  zeilen.push('')
  zeilen.push('| Status | Bedeutung |')
  zeilen.push('|---|---|')
  zeilen.push('| ✅ | Ergebnis entspricht Erwartung |')
  zeilen.push('| ⚠️ | Warnung — Count vorhanden, aber nur manuelle Prüfung kann bestätigen ob wirklich nur "eigene" Daten |')
  zeilen.push('| ❌ | Fehler — RLS-Leak (Count > 0 obwohl 0 erwartet) oder RLS blockiert zu viel (Count = 0 obwohl Daten vorhanden sein müssen) |')
  zeilen.push('| – | Tabelle existiert nicht in der DB — übersprungen |')
  zeilen.push('')
  zeilen.push('### Erwartungs-Werte')
  zeilen.push('')
  zeilen.push('| Wert | Bedeutung |')
  zeilen.push('|---|---|')
  zeilen.push('| `alle` | Rolle darf alle Rows sehen — Count > 0 nach Seed erwartet |')
  zeilen.push('| `nur_eigene` | Nur eigene Rows sichtbar — Cross-Compare nötig zur Vollprüfung |')
  zeilen.push('| `zugewiesen` | Nur zugewiesene Rows sichtbar — wie `nur_eigene` |')
  zeilen.push('| `null` | Kein Zugriff — Count muss exakt 0 sein |')
  zeilen.push('| `grob` | Grobe Liste ohne PII — Count > 0 OK, Inhalt manuell prüfen |')
  zeilen.push('')

  // ─── Datei schreiben ─────────────────────────────────────────────────────

  const ausgabePfad = join(projektRoot, 'docs', 'portals-review', 'RLS-MATRIX.md')
  const ausgabeVerzeichnis = join(projektRoot, 'docs', 'portals-review')

  if (!existsSync(ausgabeVerzeichnis)) {
    mkdirSync(ausgabeVerzeichnis, { recursive: true })
  }

  writeFileSync(ausgabePfad, zeilen.join('\n'), 'utf-8')

  // ─── Konsolen-Zusammenfassung ─────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  RLS-Prüfung abgeschlossen')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`  ❌ Fehler:   ${fehlerIssues.length + hardBlocker.length}`)
  console.log(`  ⚠️  Warnungen: ${warnIssues.length}`)
  console.log(`  Report:    ${ausgabePfad}`)
  console.log('')

  if (hardBlocker.length > 0) {
    console.error('\n[HARD-BLOCKER] Folgende Rollen konnten nicht getestet werden:')
    for (const blocker of hardBlocker) {
      console.error(`  - ${blocker.rolle} (${blocker.email}): ${blocker.fehler}`)
    }
    console.error('\nTest-User müssen in auth.users vorhanden sein.')
    console.error('Vorher node scripts/e2e-reset.mjs ausführen.\n')
    process.exit(1)
  }

  if (fehlerIssues.length > 0) {
    console.error('\n[FEHLER] RLS-Issues gefunden — Details in RLS-MATRIX.md')
    process.exit(1)
  }

  console.log('✅ Alle prüfbaren Tabellen innerhalb erwarteter Grenzen.')
  console.log('   ⚠️-Einträge erfordern manuelle Cross-Compare-Prüfung.\n')
}

// ─── Einstiegspunkt ───────────────────────────────────────────────────────

hauptProgramm().catch((err) => {
  console.error('\n[KRITISCHER FEHLER]', err)
  process.exit(1)
})
