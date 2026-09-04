'use client'

// Kasko-WB Phase 1 (Spec §7): Dispatcher sieht und korrigiert Versicherer, Tarif und Bindung. Jede Aenderung
// schreibt werkstattbindung_quelle='dispatcher' — der manuelle Eingriff bleibt nachvollziehbar.

import { useEffect, useMemo, useState } from 'react'
import { VersichererSelect } from '@/components/shared/VersichererSelect'
import type { OnboardingFeld } from '@/components/onboarding/types'
import { ladeKaskoMarken, ladeKaskoTarife } from '@/lib/kasko-wb/actions'
import type { KaskoMarke, KaskoTarif } from '@/lib/kasko-wb/types'
import { speichereKaskoTarifDispatch } from '../_actions/kasko-tarif'
import { OverrideFieldShell, type OverrideSaveStatus } from './OverrideFieldShell'

type Bindung = 'frei' | 'gebunden' | 'unbekannt'

export function DispatchKaskoTarifField({ feld, leadId, lead }: { feld: OnboardingFeld; leadId: string; lead: Record<string, unknown> }) {
  const [status, setStatus] = useState<OverrideSaveStatus>('idle')
  const [marken, setMarken] = useState<KaskoMarke[]>([])
  const [tarife, setTarife] = useState<KaskoTarif[]>([])
  const [markeId, setMarkeId] = useState<string | null>((lead.eigene_versicherung_marke_id as string | null) ?? null)
  const [tarifId, setTarifId] = useState<string | null>((lead.eigene_kasko_tarif_id as string | null) ?? null)
  const initialBindung: Bindung = lead.freie_werkstattwahl === true ? 'frei' : lead.freie_werkstattwahl === false ? 'gebunden' : 'unbekannt'
  const [bindung, setBindung] = useState<Bindung>(initialBindung)

  useEffect(() => {
    ladeKaskoMarken().then((r) => r.ok && setMarken(r.marken))
  }, [])
  useEffect(() => {
    if (!markeId) {
      setTarife([])
      return
    }
    ladeKaskoTarife(markeId).then((r) => setTarife(r.ok ? r.tarife : []))
  }, [markeId])

  const marke = useMemo(() => marken.find((m) => m.id === markeId) ?? null, [marken, markeId])

  async function persist(next: { markeId: string | null; tarifId: string | null; bindung: Bindung }) {
    setStatus('saving')
    const m = marken.find((x) => x.id === next.markeId) ?? null
    const t = tarife.find((x) => x.id === next.tarifId) ?? null
    const r = await speichereKaskoTarifDispatch(leadId, {
      eigene_versicherung_marke_id: next.markeId,
      eigene_versicherung_name: m?.marke ?? ((lead.eigene_versicherung_name as string | null) ?? null),
      eigene_kasko_tarif_id: next.tarifId,
      eigene_kasko_tarif_name: t?.anzeigename ?? null,
      freie_werkstattwahl: next.bindung === 'frei' ? true : next.bindung === 'gebunden' ? false : null,
      // Marke gewaehlt = der Kunde IST kaskoversichert; sonst bliebe eigenverantwortung ohne Antwort (stille Kante).
      eigene_versicherung: next.markeId ? 'ja' : ((lead.eigene_versicherung as 'ja' | 'nein' | null) ?? null),
    })
    setStatus(r.ok ? 'saved' : 'error')
  }

  function waehleTarif(id: string | null) {
    const t = tarife.find((x) => x.id === id) ?? null
    // Tarifwahl setzt die Bindung automatisch (Dispatcher kann sie darunter uebersteuern).
    const b: Bindung = t ? (t.hatWerkstattbindung && t.bindungsumfang !== 'nur_glas' ? 'gebunden' : 'frei') : bindung
    setTarifId(id)
    setBindung(b)
    void persist({ markeId, tarifId: id, bindung: b })
  }

  const radio = 'flex items-center gap-2 text-sm text-claimondo-navy'

  return (
    <OverrideFieldShell feld={feld} status={status}>
      <div className="flex flex-col gap-2 px-[22px]">
        <VersichererSelect
          value={markeId}
          onChange={(id) => {
            setMarkeId(id)
            setTarifId(null)
            void persist({ markeId: id, tarifId: null, bindung })
          }}
          versicherer={marken.map((m) => ({ id: m.id, name: m.marke }))}
          placeholder="Versicherer (Marke) wählen …"
          ariaLabel="Eigene Kaskoversicherung"
        />
        {marke && tarife.length > 0 && (
          <select
            value={tarifId ?? ''}
            onChange={(e) => waehleTarif(e.target.value || null)}
            className="rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy"
            aria-label="Kasko-Tarif"
          >
            <option value="">Tarif wählen …</option>
            {tarife.map((t) => (
              <option key={t.id} value={t.id}>
                {t.anzeigename} — {t.hatWerkstattbindung ? (t.bindungsumfang === 'nur_glas' ? 'Bindung nur Glas' : 'Werkstattbindung') : 'freie Wahl'}
              </option>
            ))}
          </select>
        )}
        <fieldset className="flex flex-wrap gap-4">
          <legend className="sr-only">Werkstattbindung</legend>
          {(['frei', 'gebunden', 'unbekannt'] as Bindung[]).map((b) => (
            <label key={b} className={radio}>
              <input
                type="radio"
                name={`bindung-${leadId}`}
                checked={bindung === b}
                onChange={() => {
                  setBindung(b)
                  void persist({ markeId, tarifId, bindung: b })
                }}
              />
              {b === 'frei' ? 'freie Werkstattwahl' : b === 'gebunden' ? 'Werkstattbindung' : 'unbekannt'}
            </label>
          ))}
        </fieldset>
        {marke?.wbMarker.length ? (
          <p className="text-caption text-claimondo-navy/60">Marker im Tarifnamen: {marke.wbMarker.map((m) => `„${m}“`).join(', ')}</p>
        ) : null}
      </div>
    </OverrideFieldShell>
  )
}
