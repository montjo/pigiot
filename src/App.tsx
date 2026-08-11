import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SessionProvider } from './lib/session'
import Home from './pages/Home'
import LetterPage from './pages/LetterPage'
import Admin from './pages/Admin'

export default function App() {
  return (
    <HashRouter>
      <SessionProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/carta/:id" element={<LetterPage />} />
          <Route path="/progreso" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionProvider>
    </HashRouter>
  )
}
