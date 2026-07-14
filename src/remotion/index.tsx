import { registerRoot, Composition } from 'remotion'
import { ContentClip } from './ContentClip'
import type { ContentClipProps } from './types'

const DEFAULT_PROPS: ContentClipProps = { segments: [], audioSrc: null, musicSrc: null, durationInFrames: 900 }

const RemotionRoot = () => (
  <Composition
    id="ContentClip"
    component={ContentClip}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={900}
    defaultProps={DEFAULT_PROPS}
    calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames ?? 900 })}
  />
)

registerRoot(RemotionRoot)
