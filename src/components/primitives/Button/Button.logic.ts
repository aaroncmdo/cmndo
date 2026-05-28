// Pure Aufloesung der Button-Props (Alias-Bruecke + State). DRY ueber
// Button.web.tsx + Button.native.tsx. Keine React/RN-Abhaengigkeit.
import type { ButtonProps, ButtonTone } from './Button.types'

export function resolveButtonProps(props: ButtonProps): {
  tone: ButtonTone
  handler: (() => void) | undefined
  isDisabled: boolean
  loading: boolean
} {
  const tone = props.variant ?? props.tone ?? 'navy'
  const handler = props.onClick ?? props.onPress
  const loading = Boolean(props.loading)
  return { tone, handler, isDisabled: Boolean(props.disabled) || loading, loading }
}
