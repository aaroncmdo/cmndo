'use client'

// D2: Die Unfallskizze in der Kunden-Fallakte.
//
// Der Kunde sieht die automatisch erzeugte Skizze als ENTWURF und kann melden, wenn die
// Darstellung nicht stimmt. Beides gehoert zusammen: eine Skizze zu zeigen, ohne Widerspruch
// zu ermoeglichen, laedt den Fehler ein, den sie spaeter im Gutachten anrichtet.
//
// Bewusst NICHT an `unfallskizze_bestaetigt` gegatet — das Flag heisst „Mitarbeiter hat
// freigegeben", und dieser manuelle Schritt ist auf prod noch nie erfolgt. Eine Anzeige daran
// zu haengen hiesse, sie tot zu bauen (dieselbe Falle, an der der Generator selbst schon
// einmal gestorben ist: 18 Gelegenheiten, 0 manuelle Anstoesse).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'
import { meldeSkizzeKorrektur } from '@/app/kunde/faelle/[id]/unfallskizze-actions'

export function UnfallskizzeCard({ claimId, svg }: { claimId: string; svg: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [formOffen, setFormOffen] = useState(false)
  const [text, setText] = useState('')
  const [laedt, setLaedt] = useState(false)

  async function absenden() {
    if (!text.trim()) return
    setLaedt(true)
    const res = await meldeSkizzeKorrektur(claimId, text)
    setLaedt(false)
    if (!res.ok) {
      toast.error(res.error ?? 'Die Meldung konnte nicht gesendet werden.')
      return
    }
    setFormOffen(false)
    setText('')
    // Ehrlich bleiben: Die Neuzeichnung hängt an einem Sprachmodell und kann scheitern.
    // Dem Kunden „wir haben die Skizze angepasst" zuzusagen, wenn nichts passiert ist,
    // wäre eine Zusage ohne Deckung — angekommen ist die Meldung aber in jedem Fall.
    toast.success(
      res.neuGeneriert
        ? 'Danke — wir haben die Skizze neu gezeichnet.'
        : 'Danke, Ihre Korrektur ist angekommen. Wir schauen sie uns an.',
    )
    startTransition(() => router.refresh())
  }

  return (
    <SectionCard
      title="Unfallskizze"
      subtitle="Automatisch aus Ihrer Schilderung erstellt — bitte kurz prüfen"
    >
      <div className="space-y-3">
        {/* Das SVG wird beim Erzeugen serverseitig sanitisiert (lib/unfallskizze/sanitize-svg),
            weil der Modell-Output ueber den Unfallhergang beeinflussbar ist. Was in der DB
            liegt, ist bereits entschaerft. */}
        <div
          className="overflow-x-auto rounded-ios-md border border-claimondo-border bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <p className="text-body-xs text-claimondo-ondo">
          Diese Skizze ist ein <strong>Entwurf</strong>. Sie wird später Teil des Gutachtens —
          deshalb ist wichtig, dass sie den Hergang richtig zeigt.
        </p>

        {!formOffen ? (
          <Button variant="ghost" onClick={() => setFormOffen(true)}>
            Etwas stimmt nicht
          </Button>
        ) : (
          <div className="space-y-2">
            <label htmlFor="skizze-korrektur" className="text-xs font-semibold text-claimondo-shield">
              Was ist anders?
            </label>
            <textarea
              id="skizze-korrektur"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="z. B. Der andere Wagen kam von rechts, nicht von links."
              className="w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-body-sm text-claimondo-navy"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="navy" onClick={absenden} loading={laedt} disabled={!text.trim()}>
                Korrektur senden
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setFormOffen(false)
                  setText('')
                }}
              >
                Abbrechen
              </Button>
            </div>
            <p className="text-body-xs text-claimondo-ondo">
              Wir erstellen die Skizze daraufhin neu — das dauert einen Moment.
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  )
}
