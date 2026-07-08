'use client'
import { useState, useTransition } from 'react'
import { HeartIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { toggleGefaelltMir } from '@/lib/community/actions'

export function LikeButton(props: {
  targetKind: 'post' | 'wissen' | 'comment'
  targetId: string
  initialCount: number
  initiallyLiked: boolean
}) {
  const [liked, setLiked] = useState(props.initiallyLiked)
  const [count, setCount] = useState(props.initialCount)
  const [pending, start] = useTransition()

  function onClick() {
    const nextLiked = !liked
    setLiked(nextLiked)
    setCount(c => c + (nextLiked ? 1 : -1))
    start(async () => {
      const res = await toggleGefaelltMir(props.targetKind, props.targetId)
      if (!res.ok) {
        setLiked(!nextLiked)
        setCount(c => c + (nextLiked ? -1 : 1))
        toast.error(res.error ?? 'Fehler')
      } else if (res.nowLiked !== undefined) {
        setLiked(res.nowLiked)
      }
    })
  }

  return (
    <Button
      variant="bare"
      size="sm"
      onClick={onClick}
      loading={pending}
      ariaLabel="Gefällt mir"
      iconLeft={<HeartIcon className={liked ? 'fill-current text-claimondo-ondo' : ''} size={16} />}
    >
      {count > 0 ? count : ''}
    </Button>
  )
}
