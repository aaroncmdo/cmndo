import { registerRoot, Composition } from 'remotion'
import { ContentClip } from './ContentClip.jsx'

const Root = () => (
  <Composition
    id="ContentClip"
    component={ContentClip}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={900}
    defaultProps={{ segments: [], audioPath: null }}
    calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames ?? 900 })}
  />
)

registerRoot(Root)
