import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isAvailable, useSession } from '../lib/session-context'

function Gate() {
  const { unlock } = useSession()
  const [password, setPassword] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFailed(false)
    const ok = await unlock(password)
    if (!ok) {
      setFailed(true)
      setPassword('')
    }
    setBusy(false)
  }

  return (
    <main className="screen screen--center">
      <form className="gate" onSubmit={submit}>
        <p className="gate__emoji">✉️</p>
        <h1>Hola.</h1>
        <p className="gate__text">Esto es para ti. Ya sabes la contraseña.</p>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="contraseña"
          autoFocus
          autoComplete="off"
        />
        <button type="submit" disabled={busy || password.length === 0}>
          {busy ? 'Abriendo…' : 'Entrar'}
        </button>
        {failed && <p className="gate__error">Esa no es. Prueba otra vez.</p>}
      </form>
    </main>
  )
}

export default function Home() {
  const { status, error, letters, progress, lock } = useSession()

  if (status === 'cargando') return <main className="screen screen--center">…</main>
  if (status === 'error')
    return (
      <main className="screen screen--center">
        <p className="gate__error">No se han podido cargar las cartas: {error}</p>
      </main>
    )
  if (status === 'bloqueado') return <Gate />

  const visible = letters.filter((letter) => isAvailable(letter))
  const pending = visible.filter((letter) => !progress.opened[letter.id]).length

  return (
    <main className="screen">
      <header className="header">
        <h1>Ábreme cuando…</h1>
        <p className="header__count">
          {pending > 0
            ? `${pending} de ${visible.length} sin abrir`
            : `Has abierto las ${visible.length}`}
        </p>
      </header>

      <ul className="letters">
        {visible.map((letter) => {
          const opened = progress.opened[letter.id]
          return (
            <li key={letter.id}>
              <Link
                to={`/carta/${letter.id}`}
                className={`letter ${opened ? 'letter--opened' : ''}`}
              >
                <span className="letter__emoji">{letter.emoji ?? '✉️'}</span>
                <span className="letter__body">
                  <span className="letter__title">{letter.title}</span>
                  {letter.hint && <span className="letter__hint">{letter.hint}</span>}
                </span>
                <span className="letter__state">{opened ? 'abierta' : 'cerrada'}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <footer className="footer">
        <button type="button" className="link" onClick={lock}>
          Cerrar
        </button>
      </footer>
    </main>
  )
}
