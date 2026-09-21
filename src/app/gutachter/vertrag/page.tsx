import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import KooperationsvertragClient from './KooperationsvertragClient'
import BasicPartnervertragClient from './BasicPartnervertragClient'

// Aaron 20.09.2026 (auf die Frage, ob die 16 Basic-Gutachter ohne Partnervertrag beim
// nächsten Login einmalig zur Unterschrift geführt werden sollen): „3 ja".
//
// Bis dahin zeigte diese Route JEDEM Gutachter dieselbe „Kooperationsvereinbarung" mit
// Paket-Staffel und Anzahlung — für ein Basic-Konto (kein Paket, keine Anzahlung) inhaltlich
// falsch, und sie schrieb nur zwei Flags, ohne PDF und ohne Eintrag in vertraege_unterzeichnet.
// Gemessen am 20.09. auf prod: 16 von 22 freigeschalteten Basic-Gutachtern hatten keinen
// Partnervertrag, 0 hatten eine Vertragszeile.
//
// Jetzt verzweigt die Route nach Paket:
//   basic  → BasicPartnervertragClient: die echte Vorlage `sv_basic_partnervertrag`
//            (dieselbe wie im Basic-Wizard), Unterschrift läuft über signAndStoreContract
//            (PDF im Bucket `vertraege` + Zeile in vertraege_unterzeichnet).
//   sonst  → KooperationsvertragClient (unverändert, bezahlte Pakete).

export const dynamic = 'force-dynamic'

export default async function VertragPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{
    id: string
    paket: string | null
    vertrag_unterschrieben: boolean | null
  }>(supabase, user.id, 'id, paket, vertrag_unterschrieben')
  if (!sv) redirect('/gutachter/willkommen')

  if ((sv.paket ?? 'standard') !== 'basic') {
    return <KooperationsvertragClient />
  }

  const db = createAdminClient()
  const [{ data: vorlage }, { data: profile }, { data: vertragsZeile }] = await Promise.all([
    db
      .from('vertragsvorlagen')
      .select('titel, version, inhalt_html')
      .eq('typ', 'sv_basic_partnervertrag')
      .eq('aktiv', true)
      .limit(1)
      .maybeSingle(),
    db.from('profiles').select('vorname, nachname').eq('id', user.id).maybeSingle(),
    db
      .from('vertraege_unterzeichnet')
      // Spaltennamen per information_schema geprueft: die Tabelle hat KEIN 'unterschrieben_am',
      // der Zeitpunkt heisst 'unterschrift_datum'.
      .select('id, unterschrift_datum, vorlage_version')
      .eq('sv_id', sv.id)
      .eq('vorlage_typ', 'sv_basic_partnervertrag')
      .order('unterschrift_datum', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const name = [profile?.vorname, profile?.nachname].filter(Boolean).join(' ').trim()

  return (
    <BasicPartnervertragClient
      name={name || 'Sachverständiger'}
      titel={vorlage?.titel ?? 'Partnervertrag'}
      version={(vorlage?.version as string | null) ?? null}
      inhaltHtml={(vorlage?.inhalt_html as string | null) ?? null}
      bereitsUnterschrieben={!!sv.vertrag_unterschrieben || !!vertragsZeile}
      unterschriebenAm={(vertragsZeile?.unterschrift_datum as string | null) ?? null}
    />
  )
}
