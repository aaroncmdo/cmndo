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
  const [drawing, setDrawing] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: sv } = await supabase.from('sachverstaendige').select('id, paket, paket_faelle_gesamt, anzahlung_faellig').or(`profile_id.eq.${user.id},user_id.eq.${user.id}`).single()
      const { data: p } = await supabase.from('profiles').select('vorname, nachname').eq('id', user.id).single()
      if (sv) setSvData({ id: sv.id, paket: sv.paket ?? 'standard', name: [p?.vorname, p?.nachname].filter(Boolean).join(' ') || '', anzahlung: Number(sv.anzahlung_faellig ?? 750) })
    }
    load()
  }, [supabase])

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
          await supabase.storage.from('dokumente').upload(path, blob, { contentType: 'image/png' })
          const { data: { publicUrl } } = supabase.storage.from('dokumente').getPublicUrl(path)
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

  if (!svData) return <div className="flex items-center justify-center h-screen"><div className="w-6 h-6 border-2 border-[#4573A2] border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0D1B3E] to-[#1E3A5F] px-8 py-6 text-white text-center">
          <span className="text-3xl font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span></span>
          <p className="text-[#7BA3CC] text-sm mt-2">Kooperationsvereinbarung</p>
        </div>

        {/* Contract Text */}
        <div className="px-8 py-6 max-h-[40vh] overflow-y-auto text-sm text-gray-700 space-y-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Kooperationsvereinbarung</h2>
          <p>zwischen der Claimondo GmbH und <strong>{svData.name}</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Paket: <strong>{PAKET_LABEL[svData.paket] ?? svData.paket}</strong></li>
            <li>Leadpreis-Staffelung gemäß Anlage 1 (abhängig von Schadenshöhe)</li>
            <li>Anzahlung: <strong>{svData.anzahlung}€</strong> (50% des Paketpreises)</li>
            <li>Zahlungsfrist für Monatsrechnungen: 14 Tage</li>
            <li>Kündigungsfrist: 3 Monate zum Monatsende</li>
          </ul>
          <p className="text-xs text-gray-500">Mit der Unterzeichnung bestätigen Sie, dass Sie die Bedingungen gelesen und verstanden haben. Es gelten die AGB der Claimondo GmbH.</p>
        </div>

        {/* Checkbox + Signature */}
        <div className="px-8 py-6 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-[#4573A2] rounded" />
            <span className="text-sm text-gray-700">Ich habe den Vertrag gelesen und akzeptiere die Bedingungen.</span>
          </label>

          <div>
            <p className="text-xs text-gray-500 mb-2">Unterschrift (mit Finger oder Maus zeichnen):</p>
            <canvas ref={canvasRef} className="w-full h-[120px] border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 cursor-crosshair" />
            {signed && <p className="text-[10px] text-green-600 mt-1">Unterschrift erfasst</p>}
          </div>

          <button onClick={handleSign} disabled={saving || !accepted || !signed}
            className="w-full bg-[#1E3A5F] hover:bg-[#4573A2] disabled:opacity-50 text-white text-sm font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving ? 'Wird gespeichert...' : <><CheckIcon className="w-4 h-4" /> Vertrag unterzeichnen</>}
          </button>
        </div>
      </div>
    </div>
  )
}
