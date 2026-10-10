import type { LinguaLensApi } from '../../preload/index'

declare global {
  interface Window {
    lingualens: LinguaLensApi
  }
}

export {}
