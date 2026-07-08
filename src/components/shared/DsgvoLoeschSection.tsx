import { getMyLoeschAntrag } from '@/lib/dsgvo/loesch-antrag'
import DsgvoLoeschCard from '@/components/shared/DsgvoLoeschCard'

// Server-Wrapper: laedt den offenen DSGVO-Loeschantrag des eingeloggten Users und rendert die
// (rollen-agnostische) DsgvoLoeschCard. So kann JEDES Portal (Kunde/Makler/Werkstatt/SV) den
// strukturierten Self-Service-Loeschflow mit EINER Zeile einbinden: <DsgvoLoeschSection />.
export default async function DsgvoLoeschSection() {
  const bestehenderAuftrag = await getMyLoeschAntrag()
  return <DsgvoLoeschCard bestehenderAuftrag={bestehenderAuftrag} />
}
