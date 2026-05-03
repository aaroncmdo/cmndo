// AAR-446: KB-Card für die zuletzt generierte FAQ-Bot-Analyse (aus
// `fall_summaries`, befüllt durch AAR-445). Server-Component — lädt die
// Daten selbst, hat keinen Client-State.
//
// Sichtbarkeit: nur wenn eine Analyse existiert. Sonst return null, damit
// die Admin-Fallakte keinen leeren Platzhalter zeigt.
//
// Das vorhandene Manual-Summary-Panel (`AIAssistantTab`) greift auf dieselbe
// Tabelle zu — diese Card ist das Pre-Call-Pendant: kompakt, prominent,
// direkt im Fallakte-Header sichtbar.

import { createAdminClient } from '@/lib/supabase/admin'
import { BotIcon, ClockIcon, TargetIcon } from 'lucide-react'
import { formatVorZeit } from '@/lib/format/datum'

type Analyse = {
  id: string
  kunden_anliegen: string | null
  zusammenfassung: string
  empfohlene_naechste_schritte: string | null
  ai_modell: string
  generated_at: string
}

async function ladeLetzteAnalyse(fallId: string): Promise<Analyse | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('fall_summaries')
    .select(
      'id, kunden_anliegen, zusammenfassung, empfohlene_naechste_schritte, ai_modell, generated_at',
    )
    .eq('fall_id', fallId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as Analyse | null) ?? null
}

function SchritteListe({ raw }: { raw: string }) {
  // AAR-445 speichert die Schritte als Markdown-Liste („- Schritt 1\n- ...")
  // oder als freier Text — beides unterstützen.
  const zeilen = raw
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter((l) => l.length > 0)
  if (zeilen.length === 0) return null
  return (
    <ul className="space-y-1.5">
      {zeilen.map((z, i) => (
        <li key={i} className="flex gap-2 text-sm text-[color:var(--brand-text,#0D1B3E)]">
          <span className="text-[color:var(--brand-primary,#4573A2)] mt-0.5">•</span>
          <span>{z}</span>
        </li>
      ))}
    </ul>
  )
}

export default async function FaqBotAnalyseCard({ fallId }: { fallId: string }) {
  const analyse = await ladeLetzteAnalyse(fallId)
  if (!analyse) return null

  return (
    <section
      className="rounded-2xl border px-5 py-4 mb-4"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary, #4573A2) 8%, transparent) 0%, color-mix(in srgb, var(--brand-primary, #4573A2) 2%, transparent) 100%)',
        borderColor: 'color-mix(in srgb, var(--brand-primary, #4573A2) 25%, transparent)',
      }}
      aria-label="Letzte FAQ-Bot-Analyse"
    >
      <header className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--brand-primary, #4573A2)' }}
          >
            <BotIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--brand-text,#0D1B3E)]">
              Letzte Bot-Chat-Analyse
            </h3>
            <p className="text-[11px] text-claimondo-ondo">
              Der Kunde hat mit dem FAQ-Bot gesprochen — hier ist die Zusammenfassung.
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-claimondo-ondo">
          <ClockIcon className="w-3.5 h-3.5" />
          {formatVorZeit(analyse.generated_at)}
        </span>
      </header>

      {analyse.kunden_anliegen && (
        <h4
          className="text-base font-semibold mb-2"
          style={{ color: 'var(--brand-text, #0D1B3E)' }}
        >
          „{analyse.kunden_anliegen}"
        </h4>
      )}

      <p className="text-sm text-claimondo-navy leading-relaxed mb-3">
        {analyse.zusammenfassung}
      </p>

      {analyse.empfohlene_naechste_schritte && (
        <div
          className="rounded-xl p-3"
          style={{
            background:
              'color-mix(in srgb, var(--brand-primary, #4573A2) 6%, #ffffff)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <TargetIcon
              className="w-3.5 h-3.5"
              style={{ color: 'var(--brand-primary, #4573A2)' }}
            />
            <span className="text-[11px] uppercase tracking-wider font-medium text-claimondo-ondo">
              Empfohlene nächste Schritte
            </span>
          </div>
          <SchritteListe raw={analyse.empfohlene_naechste_schritte} />
        </div>
      )}

      <footer className="mt-3 pt-2 border-t border-claimondo-border/50 flex items-center justify-end">
        <span className="text-[10px] text-claimondo-ondo/70">{analyse.ai_modell}</span>
      </footer>
    </section>
  )
}
