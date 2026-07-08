import { createAdminClient } from '@/lib/supabase/admin'

// Standard-Staffelung (Bonus-Stufen) fuer neu angelegte Partner. Werte = De-facto-Standard
// der bestehenden Partner (07.07.2026, Aaron bestaetigt): Makler 5/10/20 -> 100/200/300 €,
// Werkstatt 5/10/20 -> 200/250/300 €. Jeder neue Partner (Self-Reg + Admin-Anlage) bekommt sie
// als Default; Admin kann pro Partner via setMaklerStaffel/setWerkstattStaffel ueberschreiben.

export const STANDARD_MAKLER_STAFFEL: { schwelle: number; bonus_betrag_netto: number }[] = [
  { schwelle: 5, bonus_betrag_netto: 100 },
  { schwelle: 10, bonus_betrag_netto: 200 },
  { schwelle: 20, bonus_betrag_netto: 300 },
]

export const STANDARD_WERKSTATT_STAFFEL: { schwelle: number; bonus_betrag_netto: number }[] = [
  { schwelle: 5, bonus_betrag_netto: 200 },
  { schwelle: 10, bonus_betrag_netto: 250 },
  { schwelle: 20, bonus_betrag_netto: 300 },
]

// Setzt die Standard-Staffelung fuer einen frisch angelegten Partner (best-effort, non-fatal —
// die Partner-Anlage selbst darf daran nicht scheitern). Bei Neuanlage existieren noch keine
// Stufen; ein award-RPC ist nicht noetig (0 Vermittlungen). Ueberschreibt NICHT, falls bereits
// Stufen existieren (Admin koennte sie vorab gesetzt haben).
export async function setzeStandardStaffel(
  admin: ReturnType<typeof createAdminClient>,
  typ: 'makler' | 'werkstatt',
  partnerId: string,
): Promise<void> {
  if (!partnerId) return
  try {
    if (typ === 'makler') {
      const { data: vorhanden } = await admin
        .from('makler_staffel_stufen')
        .select('id')
        .eq('makler_id', partnerId)
        .limit(1)
        .maybeSingle()
      if (vorhanden) return
      const { error } = await admin.from('makler_staffel_stufen').insert(
        STANDARD_MAKLER_STAFFEL.map((s) => ({
          makler_id: partnerId,
          schwelle: s.schwelle,
          bonus_betrag_netto: s.bonus_betrag_netto,
        })),
      )
      if (error) console.error('[standard-staffel] makler insert:', error.message)
    } else {
      const { data: vorhanden } = await admin
        .from('werkstatt_staffel_stufen')
        .select('id')
        .eq('werkstatt_id', partnerId)
        .limit(1)
        .maybeSingle()
      if (vorhanden) return
      const { error } = await admin.from('werkstatt_staffel_stufen').insert(
        STANDARD_WERKSTATT_STAFFEL.map((s) => ({
          werkstatt_id: partnerId,
          schwelle: s.schwelle,
          bonus_betrag_netto: s.bonus_betrag_netto,
        })),
      )
      if (error) console.error('[standard-staffel] werkstatt insert:', error.message)
    }
  } catch (err) {
    console.error('[standard-staffel]', err instanceof Error ? err.message : err)
  }
}
