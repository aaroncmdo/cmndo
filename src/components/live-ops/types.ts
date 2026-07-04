import type {
  SvLiveOps,
  TerminPin,
  DeadPin,
  UnterwegsRoute,
  TagesRoute,
} from '@/lib/live-ops'

/**
 * Buendeltyp fuer alle Chunk-1-Loader-Outputs — wird als Prop an
 * LiveOpsMap uebergeben.
 */
export type LiveOpsData = {
  svs: SvLiveOps[]
  termine: TerminPin[]
  routen: UnterwegsRoute[]
  tagesrouten: TagesRoute[]
  deadPins: DeadPin[]
}

/**
 * Die 6 togglbaren Karten-Layer.
 */
export type LayerKey =
  | 'svs'
  | 'autos'
  | 'termine'
  | 'routen'
  | 'tagesrouten'
  | 'deadpins'

/**
 * Visibility-State fuer alle Layer.
 */
export type LayerState = Record<LayerKey, boolean>
