// Werkstatt-Onboarding-Drip — sendeStep: rendert + versendet EINEN faelligen Step.
//
// sendEmail() wirft bei endgueltigem Fehlschlag (nach 3 Retries), statt ein
// Result-Object zurueckzugeben — hier zu {ok:false,error} degradiert, damit der
// Cron (Task 13) den {ok,skipped?,error?}-Kontrakt einheitlich behandeln kann
// (AGENTS.md Server-Actions-Pattern; sendeStep ist keine Server-Action, folgt aber
// demselben Result-Object-statt-throw-Prinzip fuer seine Caller).
import { render } from '@react-email/render'
import { sendEmail } from '@/lib/email/google/client'
import { createOptoutToken } from '@/lib/cold-mail/optout-token'
import { registry } from '@/lib/email/google/templates/aktivierung/registry'
import type { WerkstattMergeVars, TemplateKey } from '@/lib/email/google/templates/aktivierung/types'

export type StepZuSenden = {
  position: number
  template_key: TemplateKey
  betreff: string
  preheader: string
  copy: unknown
}

export type SendeStepResult = { ok: boolean; skipped?: 'kein_sv' | 'copy_invalid'; error?: string }

/**
 * One-Click-Abmelde-URL fuer den List-Unsubscribe-Header. Wiederverwendet den
 * bestehenden `cold_mail_suppression`-Opt-out-Pfad (Design-Spec §4.3/§12): dasselbe
 * `createOptoutToken` + dieselbe `/partner-abmelden/[token]`-Route wie der Cold-Mailer
 * — kein Duplikat-Suppression-Mechanismus fuer den Werkstatt-Drip.
 */
function abmeldeUrl(email: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')
  return `${base}/partner-abmelden/${createOptoutToken(email)}`
}

/**
 * Betreff-Merge: dieselben SV-Platzhalter wie im Body (Templates .replace()n sie im Text).
 * Der Betreff kommt verbatim aus steps.betreff (Spec §5.3) — die sv_vorstellung-Zeile
 * "Ihr Gutachter in [Region]: [Gutachter-Name]" wuerde sonst un-substituiert rausgehen.
 * Harmlos fuer die 5 anderen Betreffe (keine Platzhalter -> keine Ersetzung).
 */
function substituiereBetreff(betreff: string, merge: WerkstattMergeVars): string {
  return betreff
    .replace('[Region]', merge.sv?.region ?? 'Ihrer Region')
    .replace('[Gutachter-Name]', merge.sv?.name ?? '')
}

export async function sendeStep(args: {
  empfaengerEmail: string
  step: StepZuSenden
  merge: WerkstattMergeVars
}): Promise<SendeStepResult> {
  const { empfaengerEmail, step, merge } = args

  // Mail 3 (SV-Vorstellung) ohne SV-Match im Umkreis: kein Send einer SV-losen Karte —
  // der Cron ueberspringt diesen Step (advance auf den naechsten aktiven).
  if (step.template_key === 'sv_vorstellung' && !merge.sv) {
    return { ok: true, skipped: 'kein_sv' }
  }

  const entry = registry[step.template_key]
  const parsed = entry.copySchema.safeParse(step.copy)
  if (!parsed.success) {
    console.error('[werkstatt-onboarding] copy invalid fuer Step', step.position, parsed.error.message)
    return { ok: false, skipped: 'copy_invalid' }
  }

  // Belt-and-suspenders (Review-Fix Task 13, FIX 2): render() liegt BEWUSST im selben
  // try/catch wie sendEmail — eine Render-Exception (kaputte Merge-Vars, Component-Crash)
  // soll sendeStep genauso wenig werfen lassen wie ein SMTP-Fehler. So bleibt der
  // {ok,skipped?,error?}-Kontrakt fuer ALLE Fehlerquellen dieser Funktion einheitlich, und
  // der Cron-Caller (route.ts) muss sendeStep nicht zusaetzlich try/catchen (das tut er
  // trotzdem, als zweite Verteidigungslinie fuer sonstige unerwartete Throws).
  try {
    // Type-Bruecke: `entry` ist bei nicht-literalem template_key ein Union aller
    // TemplateEntry<K>-Varianten (registry.ts) — TS kann Schema<->Component-Korrespondenz
    // ueber den dynamischen Key-Zugriff nicht verifizieren. Zur Laufzeit ist sie bereits
    // durch das erfolgreiche copySchema.safeParse desselben Keys sichergestellt.
    const html = await render(entry.Component({ copy: parsed.data, merge } as never))
    await sendEmail({
      to: empfaengerEmail,
      subject: substituiereBetreff(step.betreff, merge),
      html,
      empfaengerTyp: 'werkstatt',
      template: `werkstatt_aktivierung_${step.template_key}`,
      listUnsubscribe: abmeldeUrl(empfaengerEmail),
    })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[werkstatt-onboarding] Senden fehlgeschlagen fuer Step', step.position, message)
    return { ok: false, error: message }
  }
}
