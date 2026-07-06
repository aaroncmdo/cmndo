'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { Chip, ChipRow } from '@/components/ui/Chip'
import { postBeitrag } from '@/lib/community/actions'
import { B2B_TAGS } from '@/lib/community/tags'

export function PostComposer() {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  function handleSubmit() {
    if (!body.trim()) return
    startTransition(async () => {
      const res = await postBeitrag(body.trim(), selectedTags)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
      } else {
        setBody('')
        setSelectedTags([])
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-ios-md border border-claimondo-border bg-white p-4">
      <h3 className="mb-3 text-body-sm font-semibold text-claimondo-navy">Beitrag verfassen</h3>

      <div className="space-y-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          rows={4}
          placeholder="Beitrag schreiben…"
          className="w-full rounded-ios-sm border border-claimondo-border bg-white px-3 py-2.5 text-body-sm focus:border-claimondo-ondo focus:outline-none resize-none"
        />

        <div>
          <p className="mb-2 text-body-xs font-medium text-claimondo-navy">Themen (optional):</p>
          <ChipRow>
            {B2B_TAGS.map((tag) => (
              <Chip
                key={tag}
                variant={selectedTags.includes(tag) ? 'selected' : 'default'}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </Chip>
            ))}
          </ChipRow>
        </div>

        <div className="flex justify-end">
          <Button
            variant="navy"
            loading={pending}
            disabled={!body.trim()}
            onClick={handleSubmit}
          >
            Veröffentlichen
          </Button>
        </div>
      </div>
    </div>
  )
}
