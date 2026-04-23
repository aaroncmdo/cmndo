// AAR-727: Re-Export auf shared TerminCard. Logik lebt jetzt in
// src/components/shared/TerminCard.tsx (glass-light + iOS-Tokens + readOnly-Prop).
export {
  TerminCard,
  type SharedTerminCardProps as TerminCardProps,
} from '@/components/shared/TerminCard'
