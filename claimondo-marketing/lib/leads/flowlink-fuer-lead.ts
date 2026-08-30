import { createServiceClient } from '@/lib/supabase/server'
import { dispatchMagicLink } from '@/lib/magic-link/dispatch-magic-link'

// Erzeugt den FlowLink zu einem frisch entstandenen Marketing-Lead und schickt ihn dem
// MELDER — den Kanal zurueck in seinen eigenen Vorgang.
//
// Warum es das gibt: Von den vier Marketing-Einstiegen tat das bisher nur der Mini-Wizard
// (Aaron-Direktive 20.05.2026, `create-lead-from-mini-wizard.ts`). Startseite, Ads-Landing und
// /check erzeugten einen Lead, von dem ausschliesslich das TEAM erfuhr — der Melder bekam
// nichts und hatte keinen Weg zurueck in seinen Vorgang. Gemessen 30.08.2026 auf prod
// (Startseite, vollstaendig per UI abgesendet): Lead entstand, `flow_links` = 0, und die
// einzige Nachricht war "🔔 Neuer Lead" an die Team-Nummer.
//
// Verschaerfend: derselbe Lead bekam automatisch einen Termin (`status='reserviert'`) — und
// der Kunde erfuhr davon nichts. Ein reservierter Termin ohne Nachricht an den Melder ist
// schlechter als gar keiner.
//
// ⚠ NON-FATAL, und das ist der Unterschied zum Mini-Wizard: dort ist der Versand Teil des
// Erfolgspfads und ein Fehlschlag bricht die Action ab. Hier existiert der Lead bereits (die
// RPC `convert_anfrage_zu_lead` hat ihn angelegt) — ein gescheiterter Versand darf ihn nicht
// kaputtmachen. Der Caller loggt das Ergebnis und macht weiter. Folgt AGENTS.md
// §Server-Actions: "Non-critical Sub-Operations (WhatsApp/Email-Sends ...) bleiben in lokalen
// try/catch-Bloecken, damit ein Twilio-Fail nicht den Status-Update atomar bricht."

const GUELTIG_STUNDEN = 72

export type FlowLinkVersand =
  | { ok: true; token: string; kanal: 'whatsapp' | 'email' | 'nicht_versendet'; hinweis?: string }
  | { ok: false; token?: string; error: string }

export async function erzeugeUndSendeFlowLink(opts: {
  leadId: string
  /** Kundennummer. Fehlt sie, entsteht der Link trotzdem — nur ohne Versand. */
  telefon?: string | null
  vorname?: string | null
  sprache?: string | null
  /** Erscheint in der Timeline, z.B. 'Startseite' oder 'Anspruchs-Prüfung'. */
  quelle: string
}): Promise<FlowLinkVersand> {
  const admin = createServiceClient()

  // Idempotenz: ein zweiter Aufruf (Retry, Doppel-Submit) darf keinen zweiten Link erzeugen —
  // sonst zeigen zwei gueltige Tokens auf denselben Vorgang.
  const { data: vorhanden, error: leseFehler } = await admin
    .from('flow_links')
    .select('token')
    .eq('lead_id', opts.leadId)
    .limit(1)
    .maybeSingle()
  if (leseFehler) return { ok: false, error: `FlowLink-Lookup: ${leseFehler.message}` }

  let token = (vorhanden?.token as string | undefined) ?? undefined
  if (!token) {
    const { data, error } = await admin
      .from('flow_links')
      .insert({
        lead_id: opts.leadId,
        expires_at: new Date(Date.now() + GUELTIG_STUNDEN * 60 * 60 * 1000).toISOString(),
        // service_typ ('komplett') und sprache ('de') haben DB-Defaults — nur setzen, wenn
        // wirklich etwas anderes gemeint ist.
        ...(opts.sprache ? { sprache: opts.sprache } : {}),
      })
      .select('token')
      .single()
    if (error || !data) {
      return { ok: false, error: `FlowLink-Insert: ${error?.message ?? 'kein Token zurueck'}` }
    }
    token = data.token as string
  }

  // ⚠ KEIN localhost-Fallback wie im Mini-Wizard: der Link geht hier an einen echten Kunden.
  // Fehlt die Basis-URL, ist ein unversendeter Link das kleinere Übel gegenüber einer
  // WhatsApp mit "http://localhost:3000/flow/…" darin.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!baseUrl) {
    return { ok: true, token, kanal: 'nicht_versendet', hinweis: 'NEXT_PUBLIC_APP_URL fehlt' }
  }
  const flowUrl = `${baseUrl}/flow/${token}`

  // Ohne Nummer gibt es keinen Kanal — der Link existiert trotzdem, damit Dispatch ihn
  // manuell verschicken kann. Das ist besser als der Zustand davor (gar kein Link).
  if (!opts.telefon) {
    return { ok: true, token, kanal: 'nicht_versendet', hinweis: 'kein Telefon am Lead' }
  }

  // `email` wird von dispatchMagicLink nicht gelesen (nachgeprueft 30.08.): der Email-Fallback
  // holt die Adresse selbst ueber die leadId und meldet bei fehlender Adresse sauber
  // "Kein Email bei Lead". Diese Formulare erheben keine Email — WhatsApp ist ihr Kanal.
  const versand = await dispatchMagicLink({
    leadId: opts.leadId,
    telefon: opts.telefon,
    email: '',
    vorname: opts.vorname ?? null,
    flowUrl,
  })

  if (!versand.sent) {
    // Der Link steht — nur zugestellt wurde er nicht. Beides gehoert in die Antwort, damit
    // der Caller den Unterschied protokollieren kann.
    return { ok: false, token, error: versand.detail ?? 'Versand fehlgeschlagen' }
  }

  const kanal = versand.kanal === 'whatsapp' ? 'whatsapp' : 'email'

  // Status nachziehen wie im Mini-Wizard. Ergebnis pruefen: supabase-js wirft nicht, und ein
  // stiller Fehlschlag hiesse, dass der Lead als unversendet gilt, obwohl der Kunde den Link hat.
  const { error: statusFehler } = await admin
    .from('leads')
    .update({
      status: 'flow-gesendet',
      qualifizierungs_phase: 'flow-versendet',
      updated_at: new Date().toISOString(),
    })
    .eq('id', opts.leadId)
  if (statusFehler) {
    console.error('[flowlink-fuer-lead] Status-Update fehlgeschlagen:', statusFehler.message)
  }

  await admin
    .from('timeline')
    .insert({
      lead_id: opts.leadId,
      fall_id: null,
      typ: 'system',
      titel: `${opts.quelle}: Magic-Link per ${kanal === 'whatsapp' ? 'WhatsApp' : 'Email'} versendet`,
      beschreibung: `An ${opts.telefon}`,
    })
    .then(() => {}, () => {})

  return { ok: true, token, kanal }
}
