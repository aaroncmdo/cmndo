import { coerceLeadErfassungWert } from '@/lib/onboarding/lead-erfassung-allowlist'
import { deriveDispatchLeadFelder } from '@/lib/onboarding/derive-dispatch-felder'
import type { OnboardingTableHandler } from './types'

// CMM-49: leads-Writer fuer lead-erfassung (Self-Service /flow + Dispatcher) + beauftragung.
// ZWEI Ownership-Modelle (1:1 aus speichereFeststellungFlow / saveDispatchLeadFelder):
//   - audience 'flow'      : Token-validiert (der Wrapper resolved leadId via flow_links) -> der
//                            Wrapper setzt ctx.supabase = admin-Client, ctx.user = null. SA-Lockdown.
//   - audience 'dispatcher': eingeloggter user (Route schuetzt die Rolle) -> ctx.supabase =
//                            user-Context (RLS). SA-Lockdown + abgeleitete Spalten.
// SICHERHEIT: die felder kommen SERVERSEITIG aus onboarding_felder (der Wrapper synthetisiert sie
// aus ladeLeadErfassungLeadsFelder), NIE aus Client-Input -> die DB-Config IST die Spalten-Allowlist;
// kein zusaetzliches hartes Per-Spalte-Set noetig. coerce = coerceLeadErfassungWert ('' /undef->null,
// number->Number, segmented 'true'/'false'->boolean). ctx.supabase MUSS der korrekte Client sein
// (flow=admin / dispatcher=user) — das stellt der jeweilige Wrapper sicher.
export const leadsHandler: OnboardingTableHandler = {
  tabelle: 'leads',
  async apply(ctx, felder, values, now) {
    const leadId = ctx.leadId
    if (!leadId) return { ok: false, error: 'Kein Lead-Kontext fuer den Onboarding-Write' }

    const isDispatcher = ctx.audience === 'dispatcher'
    if (isDispatcher && !ctx.user) return { ok: false, error: 'Nicht angemeldet' }
    const db = ctx.supabase // Wrapper-gesetzt: flow=admin (Token-auth), dispatcher=user (RLS).

    // SA-Lockdown: nach Konvertierung ist der Fall SSoT, kein Lead-Edit mehr.
    const { data: lead } = await db
      .from('leads')
      .select('sa_unterschrieben, unfallort_kategorie')
      .eq('id', leadId)
      .maybeSingle()
    if ((lead as { sa_unterschrieben?: boolean } | null)?.sa_unterschrieben) {
      return {
        ok: false,
        error: isDispatcher
          ? 'Lead ist konvertiert — bitte über die Fallakte editieren.'
          : 'Dieser Vorgang ist bereits abgeschlossen.',
      }
    }

    const update: Record<string, unknown> = {}
    for (const feld of felder) {
      const spalte = feld.db_target?.spalte
      if (!spalte) continue
      if (!(feld.feld_key in values)) continue
      const raw = values[feld.feld_key]
      if (raw === undefined) continue
      update[spalte] = coerceLeadErfassungWert(feld.typ, raw)
    }
    if (Object.keys(update).length === 0) return { ok: true, id: leadId }

    // Dispatcher: abgeleitete Spalten (polizeibericht_pflicht aus polizei_vor_ort, unfallort_kategorie
    // aus schadentyp nur wenn leer). Server-berechnet, bewusst ausserhalb der Feld-Allowlist.
    if (isDispatcher) {
      Object.assign(
        update,
        deriveDispatchLeadFelder(update, ((lead as { unfallort_kategorie?: string | null } | null)?.unfallort_kategorie) ?? null),
      )
    }

    update.updated_at = now()
    const { error } = await db.from('leads').update(update).eq('id', leadId)
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: leadId }
  },
}
