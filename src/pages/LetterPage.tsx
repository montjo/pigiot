import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useSession } from '../lib/session-context'
import { estadoDeCarta, formatearFecha, planPendiente, planesDisponibles } from '../lib/estado'
import { NOMBRE_TIPO, type Carta, type Plan } from '../lib/tipos'

const ARMADO_MS = 700

function PanelPrueba({ carta, alAportar }: { carta: Carta; alAportar: (linea?: string) => void }) {
  const [foto, setFoto] = useState<string | null>(null)
  const [linea, setLinea] = useState('')
  const [salida, setSalida] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSalida(true), 8000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto) }, [foto])

  const prueba = carta.prueba!

  return (
    <section className="prueba">
      <h1>{carta.titulo}</h1>
      <p className="prueba__que">{prueba.texto}</p>

      {foto ? (
        <img className="prueba__foto" src={foto} alt="La foto que acabas de elegir" />
      ) : (
        <label className="prueba__subir">
          <input
            type="file"
            accept="image/*"
            {...(prueba.camara ? { capture: 'environment' as const } : {})}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setFoto(URL.createObjectURL(f))
            }}
          />
          <span>Elegir la foto</span>
        </label>
      )}

      {prueba.pregunta && (
        <label className="prueba__linea">
          {prueba.pregunta}
          <input value={linea} onChange={(e) => setLinea(e.target.value)} maxLength={140} />
        </label>
      )}

      <button type="button" disabled={!foto} onClick={() => alAportar(linea.trim() || undefined)}>
        Ya está, ábrela
      </button>

      {salida && (
        <button type="button" className="enlace" onClick={() => alAportar(undefined)}>
          se me está atragantando, ábrela igual
        </button>
      )}
    </section>
  )
}

function Bombo({ carta }: { carta: Carta }) {
  const { progreso, girarBombo, planHecho } = useSession()
  const [girando, setGirando] = useState(false)
  const pendiente = planPendiente(carta, progreso)
  const quedan = planesDisponibles(carta, progreso).length

  function girar() {
    setGirando(true)
    setTimeout(() => setGirando(false), 900)
    girarBombo(carta.id)
  }

  if (pendiente) return <PlanTocado carta={carta} plan={pendiente} alHacerlo={() => planHecho(carta.id, pendiente.id)} />

  return (
    <div className="bombo">
      {quedan === 0 ? (
        <p className="apagado">
          Se han acabado los planes. Eso significa que los habéis hecho todos, así que ve a
          pedirnos más.
        </p>
      ) : (
        <button type="button" onClick={girar} disabled={girando} className={girando ? 'girando' : ''}>
          {girando ? 'Girando…' : 'A ver qué te toca'}
        </button>
      )}
    </div>
  )
}

function PlanTocado({ carta, plan, alHacerlo }: { carta: Carta; plan: Plan; alHacerlo: () => void }) {
  const gente = plan.con.join(' y ')
  return (
    <div className="plan">
      <p className="plan__eti">Te ha tocado</p>
      <h2>{plan.plan}</h2>
      <p className="plan__con">con {gente}</p>
      {plan.detalle && <p className="apagado">{plan.detalle}</p>}
      <p className="plan__aviso">
        Díselo a {gente}. Se comprometió cuando escribimos esto.
      </p>
      <button type="button" className="enlace" onClick={alHacerlo}>
        ya lo hemos hecho
      </button>
      <span className="apagado"> · {carta.bombo!.length - 1} planes más ahí dentro</span>
    </div>
  )
}

function Voces({ carta }: { carta: Carta }) {
  const [i, setI] = useState(0)
  const voces = carta.voces!
  const voz = voces[i]
  return (
    <section className="voces">
      <nav className="voces__nav">
        {voces.map((v, n) => (
          <button
            key={v.de}
            type="button"
            className={n === i ? 'activa' : ''}
            onClick={() => setI(n)}
          >
            {v.de}
          </button>
        ))}
      </nav>
      <article className="voces__texto" key={voz.de}>
        {voz.cuerpo.map((p, n) => (
          <p key={n}>{p}</p>
        ))}
        <p className="voces__firma">{voz.de}</p>
      </article>
      {i < voces.length - 1 && (
        <button type="button" className="enlace" onClick={() => setI(i + 1)}>
          siguiente · {voces[i + 1].de}
        </button>
      )}
    </section>
  )
}

export default function LetterPage() {
  const { id } = useParams()
  const { status, cartas, progreso, abrir, aportarPrueba } = useSession()
  const [armada, setArmada] = useState(false)
  const [abriendo, setAbriendo] = useState(false)
  const vinoDePrueba = useRef(false)

  const carta = cartas.find((c) => c.id === id)
  const estado = carta ? estadoDeCarta(carta, progreso) : null

  useEffect(() => {
    if (estado !== 'cerrada') return
    if (vinoDePrueba.current) {
      setArmada(true)
      return
    }
    setArmada(false)
    const t = setTimeout(() => setArmada(true), ARMADO_MS)
    return () => clearTimeout(t)
  }, [estado, id])

  if (status === 'cargando') return <main className="pantalla pantalla--centro">…</main>
  if (status !== 'abierto') return <Navigate to="/" replace />
  if (!carta || estado === 'futura') return <Navigate to="/" replace />

  const volver = (
    <Link to="/" className="volver">
      ← todas las cartas
    </Link>
  )

  if (estado === 'pide-prueba') {
    return (
      <main className="pantalla" data-tipo={carta.tipo}>
        {volver}
        <PanelPrueba
          carta={carta}
          alAportar={(linea) => {
            vinoDePrueba.current = true
            aportarPrueba(carta.id, { linea })
          }}
        />
      </main>
    )
  }

  if (estado === 'cerrada') {
    return (
      <main className="pantalla" data-tipo={carta.tipo}>
        {volver}
        <section className="sobre">
          <span className="sobre__lacre" aria-hidden="true" />
          <p className="carta__tipo">{NOMBRE_TIPO[carta.tipo]}</p>
          <h1>{carta.titulo}</h1>
          <p className="apagado">Solo se abre una vez. Si es el momento, dale.</p>
          <button
            type="button"
            disabled={!armada || abriendo}
            className="sobre__boton"
            onClick={() => {
              setAbriendo(true)
              abrir(carta.id)
            }}
          >
            <span className="sobre__armado" style={{ animationDuration: `${ARMADO_MS}ms` }} />
            {abriendo ? 'Abriendo…' : 'Abrir la carta'}
          </button>
        </section>
      </main>
    )
  }

  const apertura = progreso.opened[carta.id]

  return (
    <main className="pantalla" data-tipo={carta.tipo}>
      {volver}
      <article className="papel">
        <p className="carta__tipo">{NOMBRE_TIPO[carta.tipo]}</p>
        <h1>{carta.titulo}</h1>

        {carta.cuerpo?.map((p, n) => (
          <p key={n}>{p}</p>
        ))}

        {carta.fotos?.map((f, n) => (
          <figure className="foto" key={n}>
            <img src={f.src} alt={f.pie ?? ''} loading="lazy" />
            {f.pie && <figcaption>{f.pie}</figcaption>}
          </figure>
        ))}

        {carta.voces && <Voces carta={carta} />}
        {carta.bombo && <Bombo carta={carta} />}

        <p className="matasellos">
          {carta.escritaEl && <>Escrita en {carta.escritaEl} · </>}
          Abierta el {formatearFecha(apertura.at)}
        </p>

        {carta.tipo === 'primera' && (
          <Link to="/como-va" className="enlace">
            y ahora, cómo va esto →
          </Link>
        )}
      </article>
    </main>
  )
}
