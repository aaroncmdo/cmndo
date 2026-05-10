'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckIcon } from 'lucide-react'

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
          anzahlung: Number(sv.anzahlung_faellig ?? 750),
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
    try {
      // Save signature as PNG
      const canvas = canvasRef.current
      if (canvas) {
        const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
        if (blob) {
          const path = `gutachter/${svData.id}/vertrag_unterschrift_${Date.now()}.png`
          await supabase.storage.from('fall-dokumente').upload(path, blob, { contentType: 'image/png' })
          const { data: { publicUrl } } = supabase.storage.from('fall-dokumente').getPublicUrl(path)
          await supabase.from('sachverstaendige').update({ unterschrift_url: publicUrl }).eq('id', svData.id)
        }
      }

      // Mark contract as signed
      await supabase.from('sachverstaendige').update({
        vertrag_unterschrieben: true,
        vertrag_unterschrieben_am: new Date().toISOString(),
      }).eq('id', svData.id)

      router.push('/gutachter')
      router.refresh()
    } catch { /* */ }
    setSaving(false)
  }

  const PAKET_LABEL: Record<string, string> = { standard: 'Standard (10 Fälle/Monat)', 'starter-10': 'Standard (10 Fälle/Monat)', pro: 'Pro (25 Fälle/Monat)', 'standard-25': 'Pro (25 Fälle/Monat)', premium: 'Premium (50 Fälle/Monat)', 'premium-50': 'Premium (50 Fälle/Monat)' }

  // AAR-258 Audit: Klare States statt endless Spinner.
  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen p-6">
        <div className="bg-white border border-red-200 rounded-xl p-6 max-w-md">
          <p className="text-sm font-semibold text-red-900">Vertrag konnte nicht geladen werden</p>
          <p className="text-xs text-red-700 mt-1">{loadError}</p>
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
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <CheckIcon className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-900">
              <p className="font-semibold">Vertrag bereits unterzeichnet</p>
              <p className="text-xs text-emerald-700 mt-1">
                Du hast den Kooperationsvertrag mit der Claimondo GmbH bereits digital signiert.
                Bei Fragen wende dich an aaron.sprafke@claimondo.de.
              </p>
            </div>
          </div>
          <div className="border-t border-claimondo-border pt-4 text-sm text-claimondo-navy space-y-2">
            <p><strong>Vertragsparteien:</strong> Claimondo GmbH und {svData.name}</p>
            <p><strong>Paket:</strong> {svData.paket}</p>
            <p><strong>Anzahlung:</strong> {svData.anzahlung.toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR</p>
          </div>
          <button
            onClick={() => router.push('/gutachter')}
            className="w-full py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] text-white text-sm font-semibold"
          >
            Zurück zum Dashboard
          </button>
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
            <li>Anzahlung: <strong>{svData.anzahlung}€</strong> (50% des Paketpreises)</li>
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
            <canvas ref={canvasRef} className="w-full h-[120px] border-2 border-dashed border-claimondo-border rounded-xl bg-[#f8f9fb] cursor-crosshair" />
            {signed && <p className="text-[10px] text-green-600 mt-1">Unterschrift erfasst</p>}
          </div>

          <button onClick={handleSign} disabled={saving || !accepted || !signed}
            className="w-full bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] disabled:opacity-50 text-white text-sm font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving ? 'Wird gespeichert...' : <><CheckIcon className="w-4 h-4" /> Vertrag unterzeichnen</>}
          </button>
        </div>
      </div>
    </div>
  )
}
