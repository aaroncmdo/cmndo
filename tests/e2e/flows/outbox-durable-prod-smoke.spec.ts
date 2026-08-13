import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Regel-4-Prod-Smoke fuer den durable Umbau (#5252, seit R311 auf prod).
//
// OPERATIVES SOLL (aus der Fachlogik, NICHT aus dem Code):
//   Legt ein Kundenbetreuer in der Fallakte einen Termin an, bekommt der Kunde GENAU EINE
//   Bestaetigung — nicht keine (stiller Verlust) und nicht mehrere (Doppelversand).
//   Scheitert die Zustellung endgueltig, entsteht eine sichtbare Dispatch-Aufgabe statt
//   Stille.
//
// WARUM DIESER WEG: `sendFallCommunication` ist seit #5252 durable. Seine 6 direkten
// Aufrufer sind allesamt schlecht per UI ausloesbar (Cron, KI-Action-Draft, kompletter
// Kunden-Funnel). Der Termin-Pfad in der Fallakte ruft `enqueue()` direkt — er erzeugt
// also dieselbe Outbox-Row und laesst sie vom WORKER abarbeiten. Und der Worker traegt
// das groesste Risiko des Umbaus: er muss `sendFallCommunicationDirekt` rufen; nutzte er
// die durable Variante, erzeugte jede abgearbeitete Row ihren eigenen Nachfolger.
//
// ⚠ DIE ENTSCHEIDENDE ASSERTION ist deshalb nicht "eine Row entstand", sondern dass die
// Zeilenzahl danach STABIL bleibt. Ein Test, der nur auf +1 prueft, waere auch bei einer
// Endlosschleife gruen — die faengt man nur, indem man ein zweites Mal nachsieht.
//
// Sicherheit (Regel 4): Test-Claim mit `telefon = NULL` -> die Pipeline laeuft, die
// Zustellung endet sauber in `failed: kein Empfaenger`. Es geht KEINE echte Nachricht raus.
//
// 🔴 STAND 13.08.: DIESER WEG IST MIT REGEL-4-KONTEN NICHT AUSLOESBAR.
//   `createKbVideoterminByKb` enqueued erst INNERHALB von `if (lead?.telefon)`
//   (termine.ts:128). Regel 4 verlangt aber Test-Konten mit `telefon = NULL`, damit keine
//   echten Nachrichten rausgehen — also gibt es hier nie eine Outbox-Row. Ein Konto MIT
//   Nummer zu nehmen hiesse, eine echte WhatsApp auszuloesen; das ist keine Option.
//   Dieselbe Klasse wie [[broadcast-finder-buchung-prod-nicht-smokebar]].
//
//   Der Weg ist trotzdem hier festgehalten, weil er zu 90 % erschlossen ist und beim
//   naechsten Anlauf Stunden spart:
//     • Login: `test-dispatch@claimondo.de` / `Test1234!` (⚠ NICHT smoke-admin — dessen
//       im Memory notiertes Passwort ist auf prod ungueltig, 13.08. verifiziert)
//     • Trigger: Button „Videotermin buchen" in der Fallakte `/faelle/<claimId>`
//     • ⚠ Das Formular ist INLINE, kein Modal — und die Seite traegt Dutzende weiterer
//       „Speichern"-Buttons (die Stammdaten-InlineEditFields). Ein ungescoptes
//       `.first()/.last()` speichert die Stammdaten und legt NIE einen Termin an; der
//       Test meldet dann „keine Outbox-Row" und man sucht den Fehler an der falschen
//       Stelle. Der richtige Button heisst „Buchen" und liegt im Container des
//       Uhrzeit-Feldes.
//   Verifiziert: 0 Residue auf prod (keine Termine, keine Timeline-Eintraege).
//
//   TRAGFAEHIGE ALTERNATIVEN fuer den Nachweis:
//     (a) den naechsten ohnehin geplanten Flow-/Golden-Path-Smoke mitbeobachten — er
//         durchlaeuft `flow/[token]/actions.ts`, einen echten durable Aufrufer;
//     (b) einen Consumer OHNE telefon-Guard waehlen (z.B. `kanzlei-paket.ts`) und pruefen,
//         ob dessen UI-Weg mit `telefon = NULL` traegt.
//
// Opt-in (nie in CI): RUN_OUTBOX_DURABLE_SMOKE=1 + SUPABASE_SERVICE_ROLE_KEY.

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'
// ⚠ NICHT smoke-admin@claimondo.test: das im Memory notierte Passwort ist auf prod
// ungueltig ("E-Mail oder Passwort ist falsch", verifiziert 13.08.). test-dispatch
// kommt an dieselbe Fallakte und darf Termine anlegen.
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'test-dispatch@claimondo.de'
const ADMIN_PW = process.env.SMOKE_ADMIN_PW ?? 'Test1234!'
// Etablierter Smoke-Claim: smoke-kunde@claimondo.de, telefon = NULL, Status ersterfassung.
const CLAIM_ID = process.env.SMOKE_CLAIM_ID ?? 'c963ce36-5ba0-4d9a-9897-6ceb7bd0d976'

test.skip(true, "Weg nicht auslösbar: enqueue liegt hinter `if (lead?.telefon)`, Regel 4 verlangt telefon=NULL — Begründung + erschlossener Klickweg im Header")

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

async function outboxStand(db: SupabaseClient): Promise<{ zeilen: number; letzte: string | null }> {
  const { count } = await db.from('notifications_outbox').select('id', { count: 'exact', head: true })
  const { data } = await db
    .from('notifications_outbox')
    .select('dedup_key')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { zeilen: count ?? 0, letzte: (data?.dedup_key as string | null) ?? null }
}

async function login(page: Page, email: string, pw: string) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

test('Soll: ein Termin erzeugt GENAU EINE durable Benachrichtigung — und keine Kettenreaktion', async ({
  page,
}) => {
  test.setTimeout(240_000)
  const db = admin()

  // ── Ausgangsstand ─────────────────────────────────────────────────────────────────────
  const vorher = await outboxStand(db)
  console.log(`[outbox] Baseline: ${vorher.zeilen} Zeilen (letzte: ${vorher.letzte ?? '—'})`)

  await login(page, ADMIN_EMAIL, ADMIN_PW)
  await page.goto(`${APP}/faelle/${CLAIM_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3_000) // Hydration — sonst greifen die Trigger ins Leere

  // Selbst-diagnostisch: schlaegt der Klickweg fehl, steht im Log, was die Seite zeigte.
  const sicht = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
  console.log(`[outbox] Fallakte: ${sicht.slice(0, 400)}`)

  // ── Uebergang per UI: Termin anlegen ──────────────────────────────────────────────────
  // Beschriftung tolerant fassen (der Nachweis steht ohnehin in der DB), aber NICHT zu
  // tolerant: `has-text` matcht Substring + case-insensitiv — ein blosses "Termin" traefe
  // auch Ueberschriften wie "Termine".
  // Der Enqueue haengt an `createKbVideoterminByKb` (termine.ts:16) — in der Fallakte
  // heisst der Button „Videotermin buchen". NICHT nach „Termin anlegen" suchen: den gibt
  // es dort nicht, und ein weiches `has-text("Termin")` traefe die Tab-Leiste („Termine").
  const trigger = page.locator('button:has-text("Videotermin buchen")').first()

  const triggerDa = await trigger.count()
  console.log(`[outbox] Termin-Trigger gefunden: ${triggerDa > 0 ? 'ja' : 'NEIN'}`)
  test.skip(triggerDa === 0, 'Termin-Trigger in der Fallakte nicht gefunden — Klickweg zuerst manuell klären (Log oben zeigt die Sicht)')

  await trigger.click()
  await page.waitForTimeout(2_000)
  // Selbst-diagnostisch: was verlangt das Formular? Ohne dieses Log raet man beim
  // naechsten Fehlschlag, statt zu sehen.
  const dialog = page.locator('[role="dialog"], .fixed').filter({ hasText: /Termin/i }).first()
  const dialogText = (await dialog.count())
    ? (await dialog.innerText()).replace(/\s+/g, ' ').trim()
    : (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
  console.log(`[outbox] Formular: ${dialogText.slice(0, 400)}`)
  const felder = await page.locator('input:visible, select:visible, textarea:visible').evaluateAll(
    (els) => els.map((e) => `${e.tagName.toLowerCase()}[${(e as HTMLInputElement).type ?? ''}]${(e as HTMLInputElement).placeholder ? '"' + (e as HTMLInputElement).placeholder + '"' : ''}`),
  )
  console.log(`[outbox] Felder: ${felder.join(' · ').slice(0, 300)}`)

  // Formular ausfuellen: Datum + Uhrzeit. Datumsfelder tragen seit #5254/#5256 die
  // deutsche Maske — hier bewusst mit EINSTELLIGEM Tag/Monat, weil genau das der Fall war,
  // der zuvor still verschluckt wurde.
  const morgen = new Date(Date.now() + 2 * 24 * 3600e3)
  const dd = morgen.getDate()
  const mm = morgen.getMonth() + 1
  const deDatum = `${dd}.${mm}.${morgen.getFullYear()}`

  const datumFeld = page.locator('input[placeholder="TT.MM.JJJJ"], input[type="date"]').first()
  if (await datumFeld.count()) {
    const istNativ = (await datumFeld.getAttribute('type')) === 'date'
    await datumFeld.fill(istNativ ? morgen.toISOString().slice(0, 10) : deDatum)
    console.log(`[outbox] Datum gesetzt: ${istNativ ? 'nativ/ISO' : deDatum}`)
  }
  const zeitFeld = page.locator('input[type="time"]').first()
  if (await zeitFeld.count()) await zeitFeld.fill('11:00')

  // ⚠ Das Videotermin-Formular ist INLINE in der Fallakte, kein Modal — und die Seite
  // enthaelt Dutzende weiterer Speichern-Buttons (die Stammdaten-InlineEditFields).
  // Ein `.first()`/`.last()` auf der ganzen Seite trifft deshalb den falschen: im ersten
  // Lauf wurde die Stammdaten-Sektion gespeichert, der Termin nie angelegt — und der Test
  // meldete „keine Outbox-Row", obwohl der Klickweg schuld war.
  // Deshalb: der Button im SELBEN Container wie das Uhrzeit-Feld.
  const formular = zeitFeld.locator('xpath=ancestor::*[.//input[@type="time"]][3]')
  const speichern = formular
    .locator('button:has-text("Buchen"), button:has-text("Speichern"), button[type="submit"]')
    .first()
  console.log(`[outbox] Speichern-Button (im Formular): "${(await speichern.innerText().catch(() => '?')).trim()}"`)
  await speichern.click()
  await page.waitForTimeout(3_000)
  console.log(`[outbox] nach dem Speichern: ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 300)}`)

  // ── KERN 1: genau EINE neue Row ───────────────────────────────────────────────────────
  await expect
    .poll(async () => (await outboxStand(db)).zeilen, {
      timeout: 30_000,
      message: 'der Termin erzeugt eine durable Benachrichtigung',
    })
    .toBe(vorher.zeilen + 1)

  const nachher = await outboxStand(db)
  console.log(`[outbox] nach dem Termin: ${nachher.zeilen} Zeilen · neuer Key: ${nachher.letzte}`)

  // ── KERN 2: die Row wird ABGEARBEITET (Worker laeuft) ─────────────────────────────────
  await expect
    .poll(
      async () => {
        const { data } = await db
          .from('notifications_outbox')
          .select('status')
          .eq('dedup_key', nachher.letzte!)
          .maybeSingle()
        return (data?.status as string | null) ?? null
      },
      { timeout: 60_000, message: 'der Worker arbeitet die Row ab (pending -> sent/failed)' },
    )
    // `failed` ist hier der ERWARTETE Ausgang: das Test-Konto hat telefon = NULL.
    // Beweist die Pipeline, nicht die Zustellung.
    .not.toBe('pending')

  const { data: row } = await db
    .from('notifications_outbox')
    .select('status, versuche, fehler, kanal, template')
    .eq('dedup_key', nachher.letzte!)
    .maybeSingle()
  console.log(`[outbox] Ergebnis: status=${row?.status} versuche=${row?.versuche} fehler=${row?.fehler ?? '—'}`)

  // ── KERN 3: KEINE Kettenreaktion ──────────────────────────────────────────────────────
  // Das ist die eigentliche Absicherung. Riefe der Worker die durable Variante statt
  // `sendFallCommunicationDirekt`, erzeugte jede abgearbeitete Row eine neue — die
  // Zeilenzahl liefe davon. Ein Test, der nur auf "+1" prueft, waere dann trotzdem gruen.
  await page.waitForTimeout(20_000)
  const spaeter = await outboxStand(db)
  console.log(`[outbox] 20 s später: ${spaeter.zeilen} Zeilen (erwartet: ${nachher.zeilen})`)
  expect(spaeter.zeilen, 'keine Endlosschleife — der Worker schreibt keine Folge-Rows').toBe(
    nachher.zeilen,
  )

  console.log('[outbox] ✓ genau 1 Row · abgearbeitet · keine Kettenreaktion')
})
