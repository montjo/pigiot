import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sha256Hex } from '../lib/crypto'
import { isFirebaseConfigured } from '../lib/firebase'
import { watchProgress, type Progress } from '../lib/progress'
import { useSession } from '../lib/session-context'

const ADMIN_HASH = import.meta.env.VITE_ADMIN_PASSWORD_HASH ?? ''

export default function Admin() {
  const { progressId, letters } = useSession()
  const [authorised, setAuthorised] = useState(false)
  const [password, setPassword] = useState('')
  const [failed, setFailed] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)

  useEffect(() => {
    if (!authorised || !progressId) return

    let cancelled = false
    let unsubscribe = () => {}
    watchProgress(progressId, setProgress).then((stop) => {
      if (cancelled) stop()
      else unsubscribe = stop
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [authorised, progressId])

  if (!authorised) {
    return (
      <main className="screen screen--center">
        <form
          className="gate"
          onSubmit={async (event) => {
            event.preventDefault()
            const ok = ADMIN_HASH !== '' && (await sha256Hex(password.trim())) === ADMIN_HASH
            setAuthorised(ok)
            setFailed(!ok)
            setPassword('')
          }}
        >
          <h1>Progreso</h1>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="contraseña"
            autoFocus
            autoComplete="off"
          />
          <button type="submit">Ver</button>
          {failed && (
            <p className="gate__error">
              {ADMIN_HASH === ''
                ? 'Falta configurar VITE_ADMIN_PASSWORD_HASH.'
                : 'Contraseña incorrecta.'}
            </p>
          )}
          <Link to="/" className="link">
            ← volver
          </Link>
        </form>
      </main>
    )
  }

  const opened = Object.entries(progress?.opened ?? {}).sort(([, a], [, b]) =>
    a.at < b.at ? 1 : -1,
  )
  const titleOf = (id: string) => letters.find((letter) => letter.id === id)?.title ?? id

  return (
    <main className="screen">
      <Link to="/" className="back">
        ← volver
      </Link>
      <header className="header">
        <h1>Progreso</h1>
        <p className="header__count">
          {opened.length} {opened.length === 1 ? 'carta abierta' : 'cartas abiertas'}
          {progress?.visits ? ` · ${progress.visits} visitas` : ''}
        </p>
      </header>

      {!isFirebaseConfigured && (
        <p className="gate__error">
          Firebase no está configurado en este build: aquí solo se ve el progreso de este
          dispositivo.
        </p>
      )}

      {letters.length === 0 && isFirebaseConfigured && (
        <p className="admin__note">
          Solo se ven los identificadores. Entra antes con la contraseña de las cartas en la
          pantalla principal si quieres ver los títulos.
        </p>
      )}

      <ul className="admin">
        {opened.map(([id, entry]) => (
          <li key={id}>
            <span className="admin__title">{titleOf(id)}</span>
            <span className="admin__meta">
              {new Date(entry.at).toLocaleString('es-ES')} · {entry.device}
            </span>
          </li>
        ))}
      </ul>

      {opened.length === 0 && progress && <p className="admin__note">Todavía no ha abierto ninguna.</p>}
    </main>
  )
}
