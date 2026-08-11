import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useSession } from '../lib/session-context'

/**
 * El botón de abrir tarda un momento en activarse a propósito: al venir de la
 * lista, el dedo (o el "ghost click" del móvil) queda justo encima del botón y
 * una carta solo se abre una vez.
 */
const ARM_DELAY_MS = 700

export default function LetterPage() {
  const { id } = useParams()
  const { status, letters, progress, open } = useSession()
  const [armed, setArmed] = useState(false)
  const [revealing, setRevealing] = useState(false)

  useEffect(() => {
    setArmed(false)
    const timer = setTimeout(() => setArmed(true), ARM_DELAY_MS)
    return () => clearTimeout(timer)
  }, [id])

  if (status === 'cargando') return <main className="screen screen--center">…</main>
  if (status !== 'abierto') return <Navigate to="/" replace />

  const letter = letters.find((item) => item.id === id)
  if (!letter) return <Navigate to="/" replace />

  const opened = progress.opened[letter.id]

  return (
    <main className="screen">
      <Link to="/" className="back">
        ← todas las cartas
      </Link>

      {!opened ? (
        <section className="envelope">
          <p className="envelope__emoji">{letter.emoji ?? '✉️'}</p>
          <h1>{letter.title}</h1>
          <p className="envelope__warn">Solo se abre una vez. Si es el momento, dale.</p>
          <button
            type="button"
            disabled={!armed || revealing}
            onClick={async () => {
              setRevealing(true)
              await open(letter.id)
            }}
          >
            {revealing ? 'Abriendo…' : 'Abrir la carta'}
          </button>
        </section>
      ) : (
        <article className="paper">
          <h1>{letter.title}</h1>
          {letter.body.split('\n\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          <p className="paper__date">
            Abierta el{' '}
            {new Date(opened.at).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </article>
      )}
    </main>
  )
}
