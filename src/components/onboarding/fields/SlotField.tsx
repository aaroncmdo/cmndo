'use client'

import { useEffect, useState, useCallback } from 'react'
import { ladeFreieSlots } from '@/lib/onboarding/slots'
import type { TagVerfuegbarkeit } from '@/lib/onboarding/slots'
import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
  // svId wird vom WizardClient übergeben sobald der SV bekannt ist.
  // Wenn kein svId vorhanden, werden statische Demo-Slots angezeigt.
  svId?: string | null
  anfrageId?: string | null
}

export function SlotField({ feld, value, onChange, disabled, svId, anfrageId }: Props) {
  const [tage, setTage] = useState<TagVerfuegbarkeit[]>([])
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(false)

  const selectedDate = value?.split('T')[0] ?? ''
  const selectedTime = value?.split('T')[1]?.slice(0, 5) ?? ''

  const ladeDaten = useCallback(async () => {
    setLaedt(true)
    setLadeFehler(null)
    try {
      const von = new Date()
      von.setHours(0, 0, 0, 0)
      const bis = new Date(von)
      bis.setDate(von.getDate() + 7)

      if (svId) {
        const result = await ladeFreieSlots(svId, von, bis)
        setTage(result)
      } else {
        // Demo-Slots wenn kein SV ausgewählt (Wizard noch in früher Phase)
        setTage(generateDemoTage(von, bis))
      }
    } catch (err) {
      setLadeFehler((err as Error).message)
    } finally {
      setLaedt(false)
    }
  }, [svId])

  useEffect(() => {
    ladeDaten()
  }, [ladeDaten])

  const selectedTag = tage.find(t => t.datum === selectedDate)

  function makeValue(datum: string, uhrzeit: string): string {
    if (!datum || !uhrzeit) return ''
    return `${datum}T${uhrzeit}:00`
  }

  const wochentag: Record<string, string> = {
    'Mo': 'Mo', 'Di': 'Di', 'Mi': 'Mi', 'Do': 'Do', 'Fr': 'Fr', 'Sa': 'Sa', 'So': 'So',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {feld.hint && (
        <span style={{ fontSize: 13, color: 'var(--wiz-text-3)', letterSpacing: '-.005em' }}>
          {feld.hint}
        </span>
      )}

      {ladeFehler && (
        <div style={{ fontSize: 13, color: '#c0392b', padding: '12px 16px', background: 'rgba(255,59,48,.08)', borderRadius: 'var(--wiz-r-sm)' }}>
          Slots konnten nicht geladen werden: {ladeFehler}
        </div>
      )}

      {/* Tag-Strip */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--wiz-text-2)', marginBottom: 12, letterSpacing: '-.005em' }}>
          Tag wählen
        </div>
        {laedt ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: 88, borderRadius: 'var(--wiz-r-md)', background: 'var(--wiz-fill)', animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 8 }}>
            {tage.map(tag => {
              const isActive = selectedDate === tag.datum
              const [, month, day] = tag.datum.split('-')
              const monatLabel = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][parseInt(month, 10) - 1]
              return (
                <button
                  key={tag.datum}
                  type="button"
                  disabled={disabled || !tag.frei}
                  onClick={() => tag.frei && onChange(makeValue(tag.datum, selectedTime || tag.slots[0]?.uhrzeit || ''))}
                  style={{
                    background: isActive ? 'var(--claimondo-navy)' : '#fff',
                    border: `1.5px solid ${isActive ? 'var(--claimondo-navy)' : 'var(--wiz-separator)'}`,
                    borderRadius: 'var(--wiz-r-md)',
                    padding: '14px 8px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    cursor: !tag.frei ? 'not-allowed' : disabled ? 'not-allowed' : 'pointer',
                    opacity: !tag.frei ? .35 : 1,
                    transition: 'all .22s var(--wiz-ease)',
                    boxShadow: isActive ? '0 8px 22px rgba(13,27,62,.22)' : 'none',
                    transform: isActive ? 'translateY(-2px)' : 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? 'rgba(255,255,255,.65)' : 'var(--wiz-text-3)', letterSpacing: '-.005em' }}>
                    {wochentag[tag.wochentag] ?? tag.wochentag}
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: isActive ? '#fff' : 'var(--claimondo-navy)', lineHeight: 1, letterSpacing: '-.024em' }}>
                    {day}
                  </span>
                  <span style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,.65)' : 'var(--wiz-text-3)', fontWeight: 500, letterSpacing: '-.005em' }}>
                    {monatLabel}
                  </span>
                  {tag.frei && (
                    <span style={{ marginTop: 4, fontSize: 10, fontWeight: 600, color: isActive ? '#6FE299' : '#34C759', letterSpacing: '-.005em' }}>
                      {tag.anzahl_slots} frei
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Uhrzeit-Grid */}
      {selectedTag && selectedTag.slots.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--wiz-text-2)', marginBottom: 12, letterSpacing: '-.005em' }}>
            Uhrzeit wählen
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
            {selectedTag.slots.map(slot => {
              const isActive = selectedTime === slot.uhrzeit
              return (
                <button
                  key={slot.uhrzeit}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(makeValue(selectedDate, slot.uhrzeit))}
                  style={{
                    background: isActive ? 'var(--claimondo-ondo)' : 'var(--wiz-fill)',
                    border: `1.5px solid ${isActive ? 'var(--claimondo-ondo)' : 'transparent'}`,
                    borderRadius: 'var(--wiz-r-sm)',
                    padding: '14px 10px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    transition: 'all .22s var(--wiz-ease)',
                    boxShadow: isActive ? '0 8px 20px rgba(69,115,162,.32)' : 'none',
                    transform: isActive ? 'translateY(-2px)' : 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 17, fontWeight: 700, color: isActive ? '#fff' : 'var(--claimondo-navy)', letterSpacing: '-.024em' }}>
                    {slot.uhrzeit}
                  </span>
                  <span style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,.7)' : 'var(--wiz-text-3)', fontWeight: 500, letterSpacing: '-.005em' }}>
                    {slot.dauer} Min
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!svId && (
        <p style={{ fontSize: 12, color: 'var(--wiz-text-3)', marginTop: -8, textAlign: 'center' }}>
          Vorläufige Verfügbarkeit — wird nach SV-Auswahl aktualisiert
        </p>
      )}
    </div>
  )
}

// Demo-Slots für den Fall dass kein SV gewählt ist
function generateDemoTage(von: Date, bis: Date): TagVerfuegbarkeit[] {
  const wochentage = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  const result: TagVerfuegbarkeit[] = []
  const current = new Date(von)
  const demoSlots = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']

  while (current <= bis) {
    const tagKey = current.getDay()
    const istWochentag = tagKey >= 1 && tagKey <= 5
    const datum = current.toISOString().split('T')[0]

    result.push({
      datum,
      wochentag: wochentage[tagKey],
      frei: istWochentag,
      anzahl_slots: istWochentag ? demoSlots.length : 0,
      slots: istWochentag ? demoSlots.map(u => ({ uhrzeit: u, dauer: 60 })) : [],
    })

    current.setDate(current.getDate() + 1)
  }

  return result
}
