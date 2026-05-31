import { getTranslations } from 'next-intl/server'
import { TrustStripSection } from './TrustStripSection'

// Phase B1 (21->12 Section-Komponenten): Home-spezifischer Wrapper für die
// vormals Inline-Sektion #3 (Trust-Strip). Liest die KPIs + Methodik-Note aus
// dem `home`-Namespace und reicht sie an die generische, seitenübergreifend
// genutzte TrustStripSection durch (wrappen statt duplizieren). Content/Tokens/
// t()-Keys 1:1 wie zuvor in HauptseitePremium.tsx.

export async function HomeTrustStripSection() {
  const t = await getTranslations('home')

  const kpis = t.raw('kpis') as { wert: string; label: string }[]
  const kpiMethodik = t('kpi_methodik')

  return <TrustStripSection kpis={[...kpis]} methodikNote={kpiMethodik} />
}
