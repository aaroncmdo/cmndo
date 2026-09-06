'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckIcon } from 'lucide-react'
import { Button } from '@/components/primitives/Button/Button.web'
import { getPaket } from '@/lib/pakete'
// Storage-RLS-Rest: Unterschrift-Upload + Vertrags-Flip laufen server-seitig.
// Der Browser kann den privaten Bucket nicht signieren (createSignedUrl ->
// null) — vorher wurde der unterschrift_url-Write deshalb still uebersprungen
// und der Vertrag trotzdem als unterschrieben markiert.
import { signVertragUnterschrift } from './actions'

export default function VertragPage() {
  const router = useRouter()
  const supabase = createClient()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [accepted, setAccepted] = useState(false)
  const [signed, setSigned] = useState(false)
  const [saving, setSaving] = useState(false)
  const [svData, setSvData] = useState<{ id: string; paket: string; name: string; anzahlung: number } | null>(null)
  // AAR-258: Spinner-Timeout — wenn nach 5s weder svData noch alreadySigned
  // vorhanden sind, zeigen wir einen Fehler-State statt endless Spinner.
  const [loadError, setLoadError] = useState<string | null>(null)
  // Speicher-Fehler getrennt von loadError: loadError ersetzt die ganze Seite,
  // ein fehlgeschlagenes Unterschreiben soll das Formular aber stehen lassen.
  const [saveError, setSaveError] = useState<string | null>(null)
  const [alreadySigned, setAlreadySigned] = useState(false)
  const [drawing, setDrawing] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const user = (await supabase.auth.getUser())?.data?.user ?? null
        if (!user) { setLoadError('Nicht angemeldet'); return }
        const { data: sv } = await supabase
          .from('sachverstaendige')
          .select('id, paket, paket_faelle_gesamt, anzahlung_faellig, vertrag_unterschrieben')
          .eq('profile_id', user.id)
          // multi-standort-safe: Ordering+limit(1) wie getGutachterForUser.
          .order('ist_parent_account', { ascending: true, nullsFirst: true })
          .order('paket_faelle_gesamt', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()
        if (!sv) { setLoadError('Kein SV-Profil gefunden'); return }
        // AAR-258 Audit: Wenn Vertrag bereits unterschrieben → svData
        // setzen + alreadySigned-Flag, damit User den unterschriebenen
        // Vertrag SEHEN kann (statt zum Dashboard wegzuleiten — der
        // User klickt ja "Vertrag" um den Vertrag anzuschauen).
        const { data: p } = await supabase.from('profiles').select('vorname, nachname').eq('id', user.id).single()
        setSvData({
          id: sv.id,
          paket: sv.paket ?? 'standard',
          name: [p?.vorname, p?.nachname].filter(Boolean).join(' ') || '',
          anzahlung: Number(sv.anzahlung_faellig ?? getPaket(sv.paket ?? 'standard').preis),
        })
        if (sv.vertrag_unterschrieben) setAlreadySigned(true)
      } catch (err) {
        console.error('[AAR-258] Vertrag-Load fehlgeschlagen:', err)
        setLoadError(err instanceof Error ? err.message : 'Laden fehlgeschlagen')
      }
    }
    load()
  }, [supabase, router])

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    canvas.width = canvas.offsetWidth; canvas.height = 120
    ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2; ctx.lineCap = 'round'

    let isDrawing = false; let lastX = 0; let lastY = 0
    function getPos(e: MouseEvent | TouchEvent) {
      const rect = canvas!.getBoundingClientRect()
      const touch = 'touches' in e ? e.touches[0] : e
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    }
    function start(e: MouseEvent | TouchEvent) { e.preventDefault(); isDrawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; setSigned(true) }
    function draw(e: MouseEvent | TouchEvent) { if (!isDrawing) return; e.preventDefault(); const p = getPos(e); ctx!.beginPath(); ctx!.moveTo(lastX, lastY); ctx!.lineTo(p.x, p.y); ctx!.stroke(); lastX = p.x; lastY = p.y }
    function stop() { isDrawing = false }

    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', stop)
    canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', draw, { passive: false }); canvas.addEventListener('touchend', stop)
    return () => { canvas.removeEventListener('mousedown', start); canvas.removeEventListener('mousemove', draw); canvas.removeEventListener('mouseup', stop); canvas.removeEventListener('touchstart', start); canvas.removeEventListener('touchmove', draw); canvas.removeEventListener('touchend', stop) }
  }, [svData])

  async function handleSign() {
    if (!accepted || !signed || !svData) return
    setSaving(true)
    setSaveError(null)
    try {
      const canvas = canvasRef.current
      const dataUrl = canvas?.toDataURL('image/png')
      if (!dataUrl) {
        setSaveError('Unterschrift konnte nicht gelesen werden')
        return
      }

      // Server-Action: Upload (Service-Client) + Vertrags-Flip in einem Schritt.
      // Die sv-ID leitet die Action aus der Session ab — sie wird bewusst NICHT
      // vom Client uebergeben.
      const res = await signVertragUnterschrift(dataUrl)
      if (!res.ok) {
        setSaveError(res.error ?? 'Vertrag konnte nicht unterzeichnet werden')
        return
      }

      router.push('/gutachter')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const PAKET_LABEL: Record<string, string> = { standard: 'Standard (10 Fälle/Monat)', 'starter-10': 'Standard (10 Fälle/Monat)', pro: 'Pro (25 Fälle/Monat)', 'standard-25': 'Pro (25 Fälle/Monat)', premium: 'Premium (50 Fälle/Monat)', 'premium-50': 'Premium (50 Fälle/Monat)' }

  // AAR-258 Audit: Klare States statt endless Spinner.
  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen p-6">
        <div className="bg-white border border-danger/30 rounded-ios-xl p-6 max-w-md">
          <p className="text-sm font-semibold text-danger-strong">Vertrag konnte nicht geladen werden</p>
          <p className="text-xs text-danger-strong mt-1">{loadError}</p>
        </div>
      </div>
    )
  }
  if (!svData) return <div className="flex items-center justify-center h-screen"><div className="w-6 h-6 border-2 border-[var(--brand-secondary)] border-t-transparent rounded-full animate-spin" /></div>

  // Bereits unterschriebener Vertrag: read-only Anzeige mit grünem Banner.
  if (alreadySigned) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8 space-y-4">
          <div className="bg-success-soft border border-success/30 rounded-ios-xl p-4 flex items-start gap-3">
            <CheckIcon className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
            <div className="text-sm text-success-strong">
              <p className="font-semibold">Vertrag bereits unterzeichnet</p>
              <p className="text-xs text-success-strong mt-1">
                Sie haben den Kooperationsvertrag mit der Claimondo GmbH bereits digital signiert.
                Bei Fragen wenden Sie sich an aaron.sprafke@claimondo.de.
              </p>
            </div>
          </div>
          <div className="border-t border-claimondo-border pt-4 text-sm text-claimondo-navy space-y-2">
            <p><strong>Vertragsparteien:</strong> Claimondo GmbH und {svData.name}</p>
            <p><strong>Paket:</strong> {svData.paket}</p>
            <p><strong>Anzahlung:</strong> {svData.anzahlung.toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR</p>
          </div>
          <Button
            variant="navy"
            fullWidth
            onClick={() => router.push('/gutachter')}
          >
            Zurück zum Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-primary)] px-8 py-6 text-white text-center">
          <span className="text-3xl font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-[var(--brand-accent)]">ondo</span></span>
          <p className="text-[var(--brand-accent)] text-sm mt-2">Kooperationsvereinbarung</p>
        </div>

        {/* Contract Text */}
        <div className="px-8 py-6 max-h-[40vh] overflow-y-auto text-sm text-claimondo-navy space-y-3 border-b border-claimondo-border">
          <h2 className="font-semibold text-claimondo-navy">Kooperationsvereinbarung</h2>
          <p>zwischen der Claimondo GmbH und <strong>{svData.name}</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Paket: <strong>{PAKET_LABEL[svData.paket] ?? svData.paket}</strong></li>
            <li>Leadpreis-Staffelung gemäß Anlage 1 (abhängig von Schadenshöhe)</li>
            <li>Anzahlung: <strong>{svData.anzahlung}€</strong> (wird mit Ihren Leadkosten verrechnet)</li>
            <li>Zahlungsfrist für Monatsrechnungen: 14 Tage</li>
            <li>Kündigungsfrist: 3 Monate zum Monatsende</li>
          </ul>
          <p className="text-xs text-claimondo-ondo">Mit der Unterzeichnung bestätigen Sie, dass Sie die Bedingungen gelesen und verstanden haben. Es gelten die AGB der Claimondo GmbH.</p>
        </div>

        {/* Checkbox + Signature */}
        <div className="px-8 py-6 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-[var(--brand-secondary)] rounded" />
            <span className="text-sm text-claimondo-navy">Ich habe den Vertrag gelesen und akzeptiere die Bedingungen.</span>
          </label>

          <div>
            <p className="text-xs text-claimondo-ondo mb-2">Unterschrift (mit Finger oder Maus zeichnen):</p>
            <canvas ref={canvasRef} className="w-full h-[120px] border-2 border-dashed border-claimondo-border rounded-ios-xl bg-claimondo-bg cursor-crosshair" />
            {signed && <p className="text-[10px] text-success mt-1">Unterschrift erfasst</p>}
          </div>

          {saveError && (
            <p className="text-body-xs text-danger-strong" role="alert">{saveError}</p>
          )}

          <Button variant="navy" size="lg" fullWidth onClick={handleSign} disabled={saving || !accepted || !signed}>
            {saving ? 'Wird gespeichert...' : <><CheckIcon className="w-4 h-4" /> Vertrag unterzeichnen</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
