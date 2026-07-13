import { Config } from '@remotion/cli/config'

// B-Roll + Voiceover liegen in .work/ (via staticFile referenziert).
// Auch als CLI-Flag gesetzt (--public-dir=./.work); der Flag ist autoritativ.
Config.setPublicDir('./.work')
