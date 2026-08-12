import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../lib/session-context'
import { cartasVisibles, estadoDeCarta, formatearFecha } from '../lib/estado'
import { NOMBRE_TIPO, type EstadoCarta } from '../lib/tipos'

const MARCA_VISITA = 'pigiot:ha-entrado'
const PULSACION_MS = 900

/** El acceso a la trastienda: una pulsación larga sobre la firma del pie. */
function FirmaDelGrupo() {
  const navigate = useNavigate()
  const [progreso, setProgreso] = useState(0)
  const temporizador = useRef<number>(undefined)

  function empezar() {
    const desde = Date.now()
    temporizador.current = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - desde) / PULSACION_MS)
      setProgreso(p)
      if (p === 1) {
        parar()
        navigate('/progreso')
      }
    }, 30)
  }

  function parar() {
    window.clearInterval(temporizador.current)
    setProgreso(0)
  }

  useEffect(() => () => window.clearInterval(temporizador.current), [])

  return (
    <button
      type="button"
      className="firma"
      onPointerDown={empezar}
      onPointerUp={parar}
      onPointerLeave={parar}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate('/progreso')
        }
      }}
      aria-label="para Pigi, de los de siempre"
    >
      <span className="firma__relleno" style={{ transform: `scaleX(${progreso})` }} />
      para Pigi, de los de siempre
    </button>
  )
}

function Puerta() {
  const { unlock, pista, fallos } = useSession()
  const [password, setPassword] = useState('')
  const [fallo, setFallo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [ayuda, setAyuda] = useState(false)
  const primeraVez = !localStorage.getItem(MARCA_VISITA)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true)
    setFallo(false)
    const ok = await unlock(password)
    if (ok) localStorage.setItem(MARCA_VISITA, '1')
    else {
      setFallo(true)
      setPassword('')
    }
    setOcupado(false)
  }

  return (
    <main className="pantalla pantalla--centro">
      <form className="puerta" onSubmit={enviar}>
        <p className="puerta__sobre" aria-hidden="true">
          ✉
        </p>
        <h1>Hola.</h1>
        <p className="apagado">
          {primeraVez ? 'Alguien de esta mesa te la va a decir.' : 'La contraseña ya la sabes.'}
        </p>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="contraseña"
          autoFocus
          aria-label="contraseña"
        />
        <button type="submit" disabled={ocupado || !password}>
          {ocupado ? 'Abriendo…' : 'Entrar'}
        </button>
        {fallo && <p className="error">Esa no es. Prueba otra vez.</p>}

        <button type="button" className="enlace" onClick={() => setAyuda((v) => !v)}>
          no me acuerdo
        </button>
        {ayuda && (
          <div className="ayuda">
            {pista && <p className="ayuda__pista">{pista}</p>}
            {fallos >= 3 && (
              <p className="apagado">
                No hay botón de recuperarla. Las cartas están cifradas con ella, así que sin
                contraseña no las puede leer nadie: ni tú, ni nosotros, ni Google. Escríbele a
                cualquiera de los que firman abajo y te la dicen.
              </p>
            )}
          </div>
        )}
      </form>
    </main>
  )
}

const ETIQUETA: Record<EstadoCarta, string> = {
  futura: 'aún no',
  'pide-prueba': 'pide algo',
  cerrada: 'sin abrir',
  'a-medias': 'a medias',
  abierta: 'abierta',
}

export default function Home() {
  const { status, error, cartas, progreso, lock } = useSession()

  if (status === 'cargando') return <main className="pantalla pantalla--centro">…</main>
  if (status === 'error')
    return (
      <main className="pantalla pantalla--centro">
        <p className="error">No se han podido cargar las cartas: {error}</p>
      </main>
    )
  if (status === 'bloqueado') return <Puerta />

  const visibles = cartasVisibles(cartas, progreso)
  const conEstado = visibles.map((c) => ({ carta: c, estado: estadoDeCarta(c, progreso) }))
  const sinAbrir = conEstado.filter((x) => x.estado === 'cerrada' || x.estado === 'pide-prueba').length
  const porLlegar = conEstado.filter((x) => x.estado === 'futura').length
  const abiertas = conEstado
    .filter((x) => x.estado === 'abierta' || x.estado === 'a-medias')
    .sort((a, b) => (progreso.opened[a.carta.id].at < progreso.opened[b.carta.id].at ? -1 : 1))

  return (
    <main className="pantalla">
      <header className="cabecera">
        <h1>Ábreme cuando…</h1>
        <p className="apagado">
          {sinAbrir > 0 ? `${sinAbrir} sin abrir` : 'Las has abierto todas'}
          {porLlegar > 0 && ` · ${porLlegar} aún por llegar`}
        </p>
      </header>

      <ul className="lista">
        {conEstado.map(({ carta, estado }) => {
          const bloqueada = estado === 'futura'
          const contenido = (
            <>
              <span className="carta__marca" aria-hidden="true" />
              <span className="carta__texto">
                <span className="carta__tipo">{NOMBRE_TIPO[carta.tipo]}</span>
                <span className="carta__titulo">
                  {bloqueada && !carta.pista ? 'Una carta que llega más adelante' : carta.titulo}
                </span>
                {carta.pista && <span className="carta__pista">{carta.pista}</span>}
              </span>
              <span className="carta__estado">{ETIQUETA[estado]}</span>
            </>
          )
          return (
            <li key={carta.id}>
              {bloqueada ? (
                <div className="carta carta--bloqueada" data-tipo={carta.tipo}>
                  {contenido}
                </div>
              ) : (
                <Link
                  to={`/carta/${carta.id}`}
                  className={`carta carta--${estado}`}
                  data-tipo={carta.tipo}
                >
                  {contenido}
                </Link>
              )}
            </li>
          )
        })}
        <li className="fantasma">Y las que faltan. Esto no se ha acabado.</li>
      </ul>

      {abiertas.length > 0 && (
        <section className="diario">
          <h2>Lo que ya has abierto</h2>
          <ul>
            {abiertas.map(({ carta }) => (
              <li key={carta.id}>
                <Link to={`/carta/${carta.id}`}>{carta.titulo}</Link>
                <span className="apagado"> · {formatearFecha(progreso.opened[carta.id].at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="pie">
        <Link to="/como-va" className="enlace">
          Cómo va esto
        </Link>
        <button type="button" className="enlace" onClick={lock}>
          Cerrar
        </button>
        <FirmaDelGrupo />
      </footer>
    </main>
  )
}
