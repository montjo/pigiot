import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SessionProvider } from './lib/session'
import Home from './pages/Home'
import LetterPage from './pages/LetterPage'
import ComoVa from './pages/ComoVa'
import Intro from './pages/Intro'
import Ruleta from './pages/Ruleta'
import Album from './pages/Album'
import Admin from './pages/Admin'

export default function App() {
  return (
    <HashRouter>
      <SessionProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/carta/:id" element={<LetterPage />} />
          <Route path="/intro" element={<Intro />} />
          <Route path="/ruleta" element={<Ruleta />} />
          <Route path="/album" element={<Album />} />
          <Route path="/como-va" element={<ComoVa />} />
          <Route path="/progreso" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionProvider>
    </HashRouter>
  )
}
