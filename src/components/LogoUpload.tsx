'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { UploadIcon, XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function extractColors(img: HTMLImageElement): [string, string] {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return ['#3b82f6', '#6366f1']

  const size = 50
  canvas.width = size
  canvas.height = size
  ctx.drawImage(img, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data

  // Count colors (skip near-white/black/gray)
  const counts: Record<string, number> = {}
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
    if (a < 128) continue
    const brightness = (r + g + b) / 3
    if (brightness > 240 || brightness < 15) continue // skip white/black
    const saturation = Math.max(r, g, b) - Math.min(r, g, b)
    if (saturation < 20) continue // skip gray
    // Quantize to reduce unique colors
    const qr = Math.round(r / 32) * 32
    const qg = Math.round(g / 32) * 32
    const qb = Math.round(b / 32) * 32
    const key = `${qr},${qg},${qb}`
    counts[key] = (counts[key] ?? 0) + 1
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const toHex = (s: string) => {
    const [r, g, b] = s.split(',').map(Number)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  const primary = sorted[0] ? toHex(sorted[0][0]) : '#3b82f6'
  const secondary = sorted[1] ? toHex(sorted[1][0]) : '#6366f1'
  return [primary, secondary]
}

export default function LogoUpload({ svId, currentLogoUrl, currentPrimary, currentSecondary, onSave }: {
  svId: string
  currentLogoUrl: string | null
  currentPrimary: string | null
  currentSecondary: string | null
  onSave?: () => void
}) {
  const [logoUrl, setLogoUrl] = useState(currentLogoUrl)
  const [primary, setPrimary] = useState(currentPrimary ?? '#3b82f6')
  const [secondary, setSecondary] = useState(currentSecondary ?? '#6366f1')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    if (file.size > 2 * 1024 * 1024) { toast.error('Max 2MB'); return }
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'png'
      const path = `gutachter/${svId}/logo.${ext}`
      await supabase.storage.from('profile').upload(path, file, { upsert: true, contentType: file.type })
      const { data: { publicUrl } } = supabase.storage.from('profile').getPublicUrl(path)
      setLogoUrl(publicUrl)

      // Extract colors
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = async () => {
        const [p, s] = extractColors(img)
        setPrimary(p)
        setSecondary(s)
        // Save to DB
        await supabase.from('sachverstaendige').update({ logo_url: publicUrl, brand_primary: p, brand_secondary: s }).eq('id', svId)
        setUploading(false)
        onSave?.()
      }
      img.onerror = async () => {
        await supabase.from('sachverstaendige').update({ logo_url: publicUrl }).eq('id', svId)
        setUploading(false)
        onSave?.()
      }
      img.src = publicUrl
    } catch {
      setUploading(false)
    }
  }

  async function handleColorSave() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('sachverstaendige').update({ brand_primary: primary, brand_secondary: secondary }).eq('id', svId)
    setSaving(false)
    onSave?.()
  }

  async function handleReset() {
    setPrimary('#3b82f6')
    setSecondary('#6366f1')
    const supabase = createClient()
    await supabase.from('sachverstaendige').update({ brand_primary: '#3b82f6', brand_secondary: '#6366f1' }).eq('id', svId)
    onSave?.()
  }

  return (
    <div className="space-y-3">
      {/* Logo Preview + Upload */}
      <div className="flex items-center gap-4">
        {logoUrl ? (
          <div className="relative">
            <img src={logoUrl} alt="Logo" className="h-12 w-auto max-w-32 object-contain rounded-lg border border-gray-200 p-1" />
            <button onClick={() => { setLogoUrl(null); const supabase = createClient(); supabase.from('sachverstaendige').update({ logo_url: null }).eq('id', svId) }}
              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center">
              <XIcon className="w-2.5 h-2.5" />
            </button>
          </div>
        ) : (
          <div className="h-12 w-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400">
            <UploadIcon className="w-4 h-4" />
          </div>
        )}
        <div>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="text-xs bg-[#1E3A5F] hover:bg-[#4573A2] text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
            {uploading ? 'Hochladen...' : logoUrl ? 'Logo ändern' : 'Logo hochladen'}
          </button>
          <p className="text-[10px] text-gray-400 mt-0.5">PNG, JPG, SVG · Max 2MB</p>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]) }} />
      </div>

      {/* Extracted Colors */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-500">Primär</label>
          <input type="color" value={primary} onChange={e => setPrimary(e.target.value)}
            className="w-7 h-7 rounded border border-gray-300 cursor-pointer p-0" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-500">Sekundär</label>
          <input type="color" value={secondary} onChange={e => setSecondary(e.target.value)}
            className="w-7 h-7 rounded border border-gray-300 cursor-pointer p-0" />
        </div>
        <button onClick={handleColorSave} disabled={saving}
          className="text-[10px] text-[#4573A2] hover:text-[#4573A2] font-medium ml-auto">
          {saving ? '...' : 'Speichern'}
        </button>
        <button onClick={handleReset} className="text-[10px] text-gray-400 hover:text-gray-600">Reset</button>
      </div>
    </div>
  )
}
