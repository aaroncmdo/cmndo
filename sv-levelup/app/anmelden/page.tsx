import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { pruefeStaff, type StaffDb } from '@/lib/levelup/staff'
import { AnmeldenClient } from './AnmeldenClient'

/** Die Sitzung haengt an Cookies, nicht am Cache. */
export const dynamic = 'force-dynamic'

export default async function AnmeldeSeite() {
  // Wer schon angemeldet ist, soll sich nicht noch einmal anmelden.
  const db = await createClient()
  const staff = await pruefeStaff(db as unknown as StaffDb)
  if (staff.ok) redirect('/auswertung')

  return (
    <main className="min-h-dvh bg-nacht text-chrom">
      <div className="mx-auto max-w-[1120px] px-[26px] py-20 md:py-24">
        <p className="display text-sm tracking-[0.16em] text-signal">Interner Bereich</p>

        <h1 className="display mt-3 text-white" style={{ fontSize: 'clamp(2rem, 4.4vw, 3.2rem)' }}>
          Vertriebsansicht
        </h1>

        <p className="mt-4 max-w-[56ch] text-[1.05rem] leading-relaxed text-white/80">
          Hier liegen die Auswertungen samt Maßnahmenplan und Gesprächsleitfaden. Der Zugang gilt
          für Mitarbeiter und nutzt dieselben Zugangsdaten wie das Portal — nur die Anmeldung ist
          eine eigene, weil die Sitzung des Portals auf dieser Adresse nicht gilt.
        </p>

        <AnmeldenClient />
      </div>
    </main>
  )
}
