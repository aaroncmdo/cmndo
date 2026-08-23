// Erkennt, ob eine eingehende Telefonnummer zu einem PARTNER gehoert (SV,
// Werkstatt, Makler, Mietwagen, SV-Buero) oder zu Staff — im Gegensatz zu einem
// unbekannten Interessenten.
//
// WARUM: `matchInboundToFall` prueft nur `leads` und `profiles` mit
// `rolle='kunde'`. Jeder Partner ohne Kundenrolle gilt dort als „unbekannt" und
// wuerde beim WhatsApp-Erstkontakt als KUNDEN-Lead angelegt. Gemessen 23.08.:
// von 20 WhatsApp-Absendern waren 4 Partner/Staff (27 Nachrichten), darunter der
// zweitaktivste Absender ueberhaupt — ein Admin. Von 37 `profiles` mit
// Telefonnummer sind nur 8 Kunden.
//
// Spec: docs/superpowers/specs/2026-08-23-whatsapp-erstkontakt-lead-design.md §4.1

import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export type PartnerQuelle = 'profil' | 'werkstatt' | 'makler' | 'mietwagen' | 'sv_buero'

export type PartnerTreffer = {
  istPartner: boolean
  /** Kurzname der Fundstelle; null wenn kein Treffer. */
  quelle: PartnerQuelle | null
  /** Fuer die Benachrichtigung, z.B. "SV Gaith Hamed" oder "Werkstatt Mustermann". */
  bezeichnung: string | null
}

const KEIN_TREFFER: PartnerTreffer = { istPartner: false, quelle: null, bezeichnung: null }

/**
 * Suffix-Match auf die letzten 9 Ziffern — identisch zu `matchInboundToFall`,
 * damit beide dieselbe Nummer gleich beurteilen. Waeren die Regeln verschieden,
 * koennte eine Nummer gleichzeitig „kein Kunde" und „kein Partner" sein.
 */
function suffixVon(phoneNumber: string): string | null {
  const normalized = String(phoneNumber ?? '').replace(/[^0-9]/g, '')
  const suffix = normalized.slice(-9)
  return suffix.length >= 9 ? suffix : null
}

/**
 * Prueft, ob die Nummer einem Partner oder Staff gehoert.
 *
 * Bei einem DB-Fehler wird bewusst `istPartner: true` zurueckgegeben: ein
 * fehlender Lead ist reparabel, ein faelschlich angelegter Kunden-Lead fuer
 * einen Sachverstaendigen ist Rauschen im operativen Betrieb.
 */
export async function istPartnerNummer(
  admin: AdminClient,
  phoneNumber: string,
): Promise<PartnerTreffer> {
  const suffix = suffixVon(phoneNumber)
  if (!suffix) return KEIN_TREFFER

  const like = `%${suffix}%`

  try {
    const [profileRes, werkstattRes, maklerRes, mietwagenRes, svBueroRes] = await Promise.all([
      admin.from('profiles').select('rolle, vorname, nachname').neq('rolle', 'kunde').ilike('telefon', like).limit(1),
      admin.from('werkstaetten').select('name').ilike('telefon', like).limit(1),
      admin.from('makler').select('firma').ilike('telefon', like).limit(1),
      // Aktuell beide leer (23.08.), trotzdem geprueft: fuellen sie sich spaeter,
      // entstuende sonst genau der stille Fehler, den dieser Helper verhindert.
      admin.from('mietwagenunternehmen').select('name').ilike('telefon', like).limit(1),
      admin.from('sv_buero').select('name').ilike('telefon', like).limit(1),
    ])

    const fehler =
      profileRes.error ?? werkstattRes.error ?? maklerRes.error ?? mietwagenRes.error ?? svBueroRes.error
    if (fehler) {
      console.error('[ist-partner-nummer] Lookup fehlgeschlagen — behandle als Partner:', fehler.message)
      return { istPartner: true, quelle: null, bezeichnung: null }
    }

    const profil = profileRes.data?.[0]
    if (profil) {
      const name = [profil.vorname, profil.nachname].filter(Boolean).join(' ').trim()
      const rolle = String(profil.rolle ?? '').trim()
      return {
        istPartner: true,
        quelle: 'profil',
        bezeichnung: [rolle, name].filter(Boolean).join(' ') || null,
      }
    }

    const werkstatt = werkstattRes.data?.[0]
    if (werkstatt) {
      return { istPartner: true, quelle: 'werkstatt', bezeichnung: werkstatt.name ?? 'Werkstatt' }
    }

    const makler = maklerRes.data?.[0]
    if (makler) {
      return { istPartner: true, quelle: 'makler', bezeichnung: makler.firma ?? 'Makler' }
    }

    const mietwagen = mietwagenRes.data?.[0]
    if (mietwagen) {
      return { istPartner: true, quelle: 'mietwagen', bezeichnung: mietwagen.name ?? 'Mietwagen' }
    }

    const svBuero = svBueroRes.data?.[0]
    if (svBuero) {
      return { istPartner: true, quelle: 'sv_buero', bezeichnung: svBuero.name ?? 'SV-Büro' }
    }

    return KEIN_TREFFER
  } catch (err) {
    console.error('[ist-partner-nummer] unerwarteter Fehler — behandle als Partner:', err)
    return { istPartner: true, quelle: null, bezeichnung: null }
  }
}
