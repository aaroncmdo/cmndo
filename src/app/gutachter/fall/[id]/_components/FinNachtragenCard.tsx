'use client'

// S1 (SV-Fall-Detail Placement-Cleanup, aus AAR-757-SvToolsCard herausgeloest):
// schlanke FIN-Nachtrag-Karte. Erscheint NUR, wenn die FIN fehlt — der SV traegt sie
// hier nach (saveFinVinGutachter -> Vorschaden-Pruefung). Das ist der einzige der vier
// alten SvToolsCard-Flows OHNE bestehendes Zuhause: manuelle FIN-Eingabe war nur in der
// (nicht gerenderten) SvToolsCard erreichbar; StammdatenAccordion zeigt die FIN nur
// read-only. Die uebrigen drei Flows sind korrekt anderswo platziert und wurden aus der
// SvToolsCard entfernt: ZB1-OCR im VorOrtClient (/api/sv/upload-with-ocr, Vorder+Rueck),
// Gutachten in GutachtenCard (slot-basiert + versioniert), freie Dateien in
// WeitereDokumenteCard + FallWindowDropzone. Eine Karte = eine Funktion (CMM-23-Spec).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FingerprintIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { saveFinVinGutachter } from '../actions'

export function FinNachtragenCard({ fallId }: { fallId: string }) {
  const router = useRouter()
  const [finInput, setFinInput] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await saveFinVinGutachter(fallId, finInput)
      if (res?.error) {
        toast.error(res.error)
      } else {
        toast.success('FIN gespeichert. Vorschaden-Prüfung gestartet.')
        setFinInput('')
        router.refresh()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'FIN-Speicherung fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      title="FIN / VIN nachtragen"
      icon={<FingerprintIcon className="w-4 h-4 text-claimondo-ondo" />}
      hint="Keine FIN hinterlegt. 17-stellige Fahrzeug-Identifikationsnummer eintragen — startet die Vorschaden-Prüfung."
    >
      <div className="flex gap-2">
        <input
          value={finInput}
          onChange={(e) => setFinInput(e.target.value.toUpperCase())}
          placeholder="WBA1234567890ABCD"
          maxLength={17}
          className="flex-1 bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
        />
        <Button
          variant="navy"
          size="sm"
          loading={saving}
          disabled={finInput.length !== 17}
          onClick={handleSave}
        >
          Speichern
        </Button>
      </div>
    </SectionCard>
  )
}
