import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../lib/session-context'
import { cartasVisibles, estadoDeCarta, formatearFecha } from '../lib/estado'
import { NOMBRE_TIPO, type Carta, type EstadoCarta, type Progreso } from '../lib/tipos'

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
        <div className="puerta__cabecera">
          <p className="puerta__marca">Para Pigi</p>
          <h1>Ábreme cuando…</h1>
          <p className="puerta__texto">
            {primeraVez
              ? 'Un regalo privado de los de siempre. Pide la contraseña en la mesa y entra.'
              : 'Vuelve a entrar con la contraseña del regalo.'}
          </p>
        </div>
        <label className="campo-login">
          <span>Contraseña</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Escríbela aquí"
            autoFocus
          />
        </label>
        <button type="submit" disabled={ocupado || !password}>
          {ocupado ? 'Abriendo…' : 'Entrar'}
        </button>
        {fallo && <p className="error">Esa no es. Prueba otra vez.</p>}

        <button type="button" className="enlace puerta__ayuda" onClick={() => setAyuda(true)}>
          No me acuerdo
        </button>
        {ayuda && (
          <div className="ayuda">
            <p className="ayuda__titulo">Escríbele a Montjo.</p>
            <p className="apagado">Dile que no recuerdas la contraseña y te la pasará.</p>
            {pista && fallos >= 2 && <p className="ayuda__pista">{pista}</p>}
          </div>
        )}
      </form>
    </main>
  )
}

const ETIQUETA: Record<EstadoCarta, string> = {
  futura: 'más adelante',
  'pide-prueba': 'pide prueba',
  cerrada: 'abrir',
  'a-medias': 'terminar',
  abierta: 'releer',
}

function CartaEnLista({
  carta,
  estado,
  progreso,
}: {
  carta: Carta
  estado: EstadoCarta
  progreso: Progreso
}) {
  const bloqueada = estado === 'futura'
  const apertura = progreso.opened[carta.id]
  const titulo = bloqueada && !carta.pista ? 'Una carta que llega más adelante' : carta.titulo
  const contenido = (
    <>
      <span className="carta__marca" aria-hidden="true" />
      <span className="carta__texto">
        <span className="carta__tipo">{NOMBRE_TIPO[carta.tipo]}</span>
        <span className="carta__titulo">{titulo}</span>
        {carta.pista && <span className="carta__pista">{carta.pista}</span>}
        {apertura && (
          <span className="carta__fecha">Abierta el {formatearFecha(apertura.at)}</span>
        )}
      </span>
      <span className="carta__estado">{ETIQUETA[estado]}</span>
    </>
  )

  if (bloqueada) {
    return (
      <div className="carta carta--bloqueada" data-tipo={carta.tipo}>
        {contenido}
      </div>
    )
  }

  return (
    <Link to={`/carta/${carta.id}`} className={`carta carta--${estado}`} data-tipo={carta.tipo}>
      {contenido}
    </Link>
  )
}

function SeccionCartas({
  titulo,
  descripcion,
  items,
  progreso,
  vacio,
}: {
  titulo: string
  descripcion?: string
  items: { carta: Carta; estado: EstadoCarta }[]
  progreso: Progreso
  vacio?: string
}) {
  return (
    <section className="seccion-cartas">
      <div className="seccion-cartas__cabecera">
        <h2>{titulo}</h2>
        {descripcion && <p>{descripcion}</p>}
      </div>
      {items.length > 0 ? (
        <ul className="lista">
          {items.map(({ carta, estado }) => (
            <li key={carta.id}>
              <CartaEnLista carta={carta} estado={estado} progreso={progreso} />
            </li>
          ))}
        </ul>
      ) : (
        vacio && <p className="estado-vacio">{vacio}</p>
      )}
    </section>
  )
}

export default function Home() {
  const { status, error, cartas, progreso, lock, modoRevision } = useSession()

  if (status === 'cargando') return <main className="pantalla pantalla--centro">…</main>
  if (status === 'error')
    return (
      <main className="pantalla pantalla--centro">
        <p className="error">No se han podido cargar las cartas: {error}</p>
      </main>
    )
  if (status === 'bloqueado') return <Puerta />

  const visibles = cartasVisibles(cartas, progreso, new Date(), modoRevision)
  const conEstado = visibles.map((c) => ({ carta: c, estado: estadoDeCarta(c, progreso, new Date(), modoRevision) }))
  const paraAbrir = conEstado.filter(
    (x) => x.estado === 'cerrada' || x.estado === 'pide-prueba' || x.estado === 'a-medias',
  )
  const abiertas = conEstado
    .filter((x) => x.estado === 'abierta')
    .sort((a, b) => (progreso.opened[a.carta.id].at < progreso.opened[b.carta.id].at ? 1 : -1))
  const futuras = conEstado.filter((x) => x.estado === 'futura')

  return (
    <main className="pantalla">
      <header className="cabecera">
        <div className="cabecera__barra">
          <p className="cabecera__marca">Para Pigi</p>
          <nav className="cabecera__acciones" aria-label="Acciones">
            <Link to="/como-va" className="enlace">
              Cómo va esto
            </Link>
            <button type="button" className="enlace" onClick={lock}>
              Cerrar
            </button>
          </nav>
        </div>
        <h1>Ábreme cuando…</h1>
        <p className="cabecera__intro">Un buzón privado para los momentos importantes.</p>
        {modoRevision && <p className="modo-revision">Modo revisión · nada de lo que hagas aquí se guardará</p>}
        <dl className="resumen" aria-label="Resumen de cartas">
          <div>
            <dt>Para abrir</dt>
            <dd>{paraAbrir.length}</dd>
          </div>
          <div>
            <dt>Abiertas</dt>
            <dd>{abiertas.length}</dd>
          </div>
          <div>
            <dt>Después</dt>
            <dd>{futuras.length}</dd>
          </div>
        </dl>
      </header>

      {paraAbrir.length > 0 ? (
        <SeccionCartas
          titulo="Para abrir"
          descripcion="Lo que está esperando ahora."
          items={paraAbrir}
          progreso={progreso}
        />
      ) : (
        <section className="estado-listo">
          <h2>Todo leído por ahora</h2>
          <p>Cuando haya otra carta esperando, aparecerá aquí arriba.</p>
        </section>
      )}

      {abiertas.length > 0 && (
        <SeccionCartas
          titulo="Ya abiertas"
          descripcion="Quedan aquí para volver cuando quieras."
          items={abiertas}
          progreso={progreso}
        />
      )}

      {futuras.length > 0 && (
        <SeccionCartas
          titulo="Más adelante"
          descripcion="Aparecerán cuando llegue su momento."
          items={futuras}
          progreso={progreso}
        />
      )}

      <p className="fantasma">Y las que faltan. Esto no se ha acabado.</p>

      <footer className="pie">
        <FirmaDelGrupo />
      </footer>
    </main>
  )
}
