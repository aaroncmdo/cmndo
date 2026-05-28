// Pure Aufloesung der Button-Props (Defaults + State). DRY ueber
// Button.web.tsx + Button.native.tsx. Keine React/RN-Abhaengigkeit.
import type { ButtonProps, ButtonTone } from './Button.types'

export function resolveButtonProps(props: ButtonProps): {
  tone: ButtonTone
  handler: (() => void) | undefined
  isDisabled: boolean
  loading: boolean
} {
  const tone = props.variant ?? 'navy'
  const handler = props.onClick
  const loading = Boolean(props.loading)
  return { tone, handler, isDisabled: Boolean(props.disabled) || loading, loading }
}
