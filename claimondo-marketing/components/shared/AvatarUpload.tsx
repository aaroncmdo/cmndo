'use client'

// AAR-369: Wiederverwendbare Avatar-Upload-Komponente für alle Mitarbeiter-Rollen
// (KB, Admin, SV, Dispatch). Zeigt aktuelles Bild oder Initialen-Fallback,
// erlaubt Datei-Auswahl (JPEG/PNG/WebP, max 5 MB) und Entfernen.

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CameraIcon, Trash2Icon } from 'lucide-react'
import { uploadAvatar, removeAvatar } from '@/lib/profile/avatar'

type Props = {
  currentUrl: string | null
  initials: string
  size?: 'sm' | 'md' | 'lg'
  onChanged?: (url: string | null) => void
}

const SIZE_CLASS: Record<NonNullable<Props['size']>, string> = {
  sm: 'w-12 h-12 text-base',
  md: 'w-16 h-16 text-xl',
  lg: 'w-24 h-24 text-3xl',
}

export default function AvatarUpload({ currentUrl, initials, size = 'md', onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl)
  const [isPending, startTransition] = useTransition()

  const boxClass = SIZE_CLASS[size]

  function handlePick() {
    inputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Client-Validierung für schnelles Feedback
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Nur JPEG, PNG oder WebP erlaubt')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Bild zu groß (max 5 MB)')
      return
    }

    const formData = new FormData()
    formData.append('avatar', file)

    startTransition(async () => {
      const result = await uploadAvatar(formData)
      if (result.success) {
        setPreviewUrl(result.avatarUrl)
        onChanged?.(result.avatarUrl)
        toast.success('Profilbild aktualisiert')
      } else {
        toast.error(result.error)
      }
      // Input zurücksetzen, damit dieselbe Datei nochmal wählbar ist
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  function handleRemove() {
    if (!previewUrl) return
    if (!confirm('Profilbild wirklich entfernen?')) return
    startTransition(async () => {
      const result = await removeAvatar()
      if (result.success) {
        setPreviewUrl(null)
        onChanged?.(null)
        toast.success('Profilbild entfernt')
      } else {
        toast.error(result.error ?? 'Fehler beim Entfernen')
      }
    })
  }

  return (
    <div className="flex items-center gap-3">
      <div
        className={`${boxClass} rounded-full bg-claimondo-bg flex items-center justify-center text-claimondo-ondo font-semibold overflow-hidden relative`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Profilbild" className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
        {isPending && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handlePick}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg border border-claimondo-ondo text-claimondo-ondo text-xs font-medium hover:bg-claimondo-ondo/5 transition-colors disabled:opacity-50"
        >
          <CameraIcon className="w-3.5 h-3.5" />
          {previewUrl ? 'Ändern' : 'Hochladen'}
        </button>
        {previewUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg text-claimondo-ondo text-xs hover:text-red-600 transition-colors disabled:opacity-50"
          >
            <Trash2Icon className="w-3.5 h-3.5" />
            Entfernen
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
