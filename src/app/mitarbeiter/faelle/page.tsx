// AAR-68: Mitarbeiter Faelle-Liste — alle dem KB zugewiesenen Faelle
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

export default async function MitarbeiterFaelle() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lead_id, created_at, sa_unterschrieben')
    .eq('kundenbetreuer_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <PageHeader title="Meine Fälle" description="Alle Ihnen zugewiesenen Fälle, sortiert nach Erstellung." size="lg" />

      <div className="bg-white rounded-xl border border-claimondo-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-claimondo-bg text-xs uppercase text-claimondo-ondo">
            <tr>
              <th className="text-left px-4 py-2">Fall</th>
              <th className="text-left px-4 py-2">Fahrzeug</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Erstellt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-claimondo-border">
            {(faelle ?? []).map(f => (
              <tr key={f.id} className="hover:bg-claimondo-bg">
                <td className="px-4 py-3">
                  <Link href={`/faelle/${f.id}`} className="text-claimondo-ondo hover:underline font-medium">
                    {f.fall_nummer ?? f.id.slice(0, 8)}
                  </Link>
                  {f.kennzeichen && <p className="text-xs text-claimondo-ondo/70">{f.kennzeichen}</p>}
                </td>
                <td className="px-4 py-3 text-claimondo-navy">
                  {[f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-claimondo-bg text-claimondo-ondo">{f.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-claimondo-ondo/70">
                  {new Date(f.created_at).toLocaleDateString('de-DE')}
                </td>
              </tr>
            ))}
            {(!faelle || faelle.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-claimondo-ondo/70 text-sm">Keine Fälle zugewiesen</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
