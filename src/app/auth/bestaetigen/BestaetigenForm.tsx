'use client'

import { useFormStatus } from 'react-dom'
import { LoadingButton } from '@/components/ui/loading-button'
import { bestaetigeMagicLink } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <LoadingButton
      type="submit"
      isLoading={pending}
      loadingText="Wird geprüft …"
      className="w-full py-3.5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] hover:shadow-cta-ondo-hover active:translate-y-0 active:scale-[0.98] transition-all duration-250 ease-[cubic-bezier(.32,.72,0,1)]"
    >
      Bestätigen und fortfahren
    </LoadingButton>
  )
}

export function BestaetigenForm({
  tokenHash,
  type,
  next,
}: {
  tokenHash: string
  type: string
  next: string
}) {
  // form action = Server-Action -> POST. Erst dieser POST (echter Klick) loest verifyOtp aus;
  // ein Prefetch/Scanner macht nur GET auf die Seite und verbrennt den Token nicht.
  return (
    <form action={bestaetigeMagicLink} className="flex flex-col gap-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <SubmitButton />
    </form>
  )
}
