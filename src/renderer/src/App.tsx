import { useEffect, useState } from 'react'
import MainWindow from './windows/MainWindow'
import LensWindow from './windows/LensWindow'
import CaptureOverlay from './windows/CaptureOverlay'
import SettingsWindow from './windows/SettingsWindow'

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#\/?/, '') || 'main')

  useEffect(() => {
    const handler = () => setRoute(window.location.hash.replace(/^#\/?/, '') || 'main')
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  if (route === 'lens') return <LensWindow />
  if (route === 'overlay') return <CaptureOverlay />
  if (route === 'settings') return <SettingsWindow />
  return <MainWindow />
}
