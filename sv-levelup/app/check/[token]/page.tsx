import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { ladeCheck } from '@/lib/levelup/check'
import { baueBefund } from '@/lib/levelup/befund'
import { baueKontext } from '@/lib/levelup/pruefumfang'
import { MODULE } from '@/lib/levelup/registry'
import { sperrgrund, vorauswahl } from '@/lib/levelup/sperrlogik'
import type { Db } from '@/lib/anreicherung/schreiben'
import { CheckClient } from './CheckClient'

/** Der Check-Zustand haengt an der Datenbank, nicht am Cache. */
export const dynamic = 'force-dynamic'

export default async function CheckSeite(props: { params: Promise<{ token: string }> }) {
  // ⚠ Next 16: `params` ist ein Promise. Der synchrone Zugriff ist entfernt,
  // nicht nur veraltet.
  const { token } = await props.params

  const db = createAdminClient() as unknown as Db
  const check = await ladeCheck(db, token)

  // Ungueltiger Token -> 404 ohne Hinweis worauf (Welle 2 A). Ein
  // unterscheidbarer Fehler waere ein Orakel zum Erraten gueltiger Links.
  if (!check) notFound()

  const kontext = baueKontext(check)

  // Ist der Check bereits durch, kommt der Befund vom SERVER — kein zweiter
  // Roundtrip beim Laden, und der Client braucht keinen Effect, der beim
  // Rendern Zustand setzt (react-hooks/set-state-in-effect).
  let fertigerBefund = null
  let hatTermin = false
  let hatFunnel = false
  if (check.status === 'fertig') {
    const r = await baueBefund(db, token)
    if (r.ok) fertigerBefund = r.befund

    // Woran der Nutzer weitermacht, haengt am Zustand — nicht an dem, was er
    // zuletzt im Browser geklickt hat. Ein neu geoeffneter Link soll dort
    // fortsetzen, wo der Vorgang steht.
    const [{ data: termin }, { data: funnel }] = await Promise.all([
      db.from('levelup_termine').select('id').eq('check_id', check.id).maybeSingle(),
      db.from('levelup_funnel').select('check_id').eq('check_id', check.id).maybeSingle(),
    ])
    hatTermin = Boolean(termin)
    hatFunnel = Boolean(funnel)
  }

  // Die Kacheln kommen VOM SERVER, samt Sperrgrund im Klartext. Der Client
  // entscheidet nur, was angehakt ist — geprueft wird ohnehin erneut in F-02.
  const kacheln = MODULE.map((m) => ({
    id: m.id,
    titel: m.titel,
    punkte: m.punkte,
    dauerMin: m.dauerMin,
    gruppe: m.gruppe,
    gesperrt: sperrgrund(m, kontext),
  }))

  return (
    <CheckClient
      token={token}
      modus={check.modus}
      status={check.status}
      hatWebsite={Boolean(check.website_url)}
      websiteUrl={check.website_url}
      ort={check.standort_ort}
      kacheln={kacheln}
      vorausgewaehlt={check.module_gewuenscht.length > 0 ? check.module_gewuenscht : vorauswahl(kontext)}
      gewaehlt={check.module_gewaehlt}
      ersterBefund={fertigerBefund}
      hatTermin={hatTermin}
      hatFunnel={hatFunnel}
    />
  )
}
