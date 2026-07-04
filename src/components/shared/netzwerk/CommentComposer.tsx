'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { postKommentar } from '@/lib/community/actions'

export function CommentComposer(props: {
  targetKind: 'post' | 'wissen'
  targetId: string
  parentId?: string
  mention?: string
  onDone?: () => void
}) {
  const [body, setBody] = useState(props.mention ? `@${props.mention} ` : '')
  const [pending, start] = useTransition()
  const router = useRouter()

  function submit() {
    const text = body.trim()
    if (!text) return
    start(async () => {
      const res = await postKommentar(props.targetKind, props.targetId, text, props.parentId)
      if (!res.ok) { toast.error(res.error ?? 'Fehler'); return }
      setBody('')
      router.refresh()
      props.onDone?.()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={2}
        placeholder="Kommentar schreiben…"
        maxLength={2000}
        className="w-full rounded-ios-sm border border-claimondo-border bg-white px-3 py-2 text-body-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-light-blue"
      />
      <div className="flex justify-end">
        <Button variant="navy" size="sm" onClick={submit} loading={pending}>
          Kommentieren
        </Button>
      </div>
    </div>
  )
}
