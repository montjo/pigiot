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
  const [ubicacion, setUbicacion] = useState<'sin-comprobar' | 'comprobando' | 'fuera' | 'dentro' | 'error'>('sin-comprobar')

  useEffect(() => {
    const t = setTimeout(() => setSalida(true), 8000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto) }, [foto])

  const prueba = carta.prueba!
  const esUbicacion = Boolean(prueba.ubicacion)

  async function comprobarUbicacion() {
    if (!navigator.geolocation) {
      setUbicacion('error')
      return
    }

    setUbicacion('comprobando')
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const respuesta = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=es`,
          )
          if (!respuesta.ok) throw new Error('No se pudo consultar el país')
          const datos = (await respuesta.json()) as { countryCode?: string }
          setUbicacion(datos.countryCode === 'ES' ? 'dentro' : 'fuera')
        } catch {
          setUbicacion('error')
        }
      },
      () => setUbicacion('error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    )
  }

  return (
    <section className="prueba">
      <p className="prueba__etiqueta">Antes de abrir</p>
      <h1>{carta.titulo}</h1>
      <p className="prueba__que">{prueba.texto}</p>

      {esUbicacion ? (
        <div className="prueba__ubicacion">
          <p className="prueba__ubicacion-estado">
            {ubicacion === 'fuera' && 'Estás fuera de España. Esta carta ya puede abrirse.'}
            {ubicacion === 'dentro' && 'Parece que sigues en España. Todavía no es el momento.'}
            {ubicacion === 'comprobando' && 'Comprobando dónde estás…'}
            {ubicacion === 'error' && 'No hemos podido comprobar tu ubicación. Necesitamos permiso para verificarla.'}
            {ubicacion === 'sin-comprobar' && 'Usaremos la ubicación del dispositivo para comprobar que estás fuera de España.'}
          </p>
          <button type="button" className="prueba__ubicacion-boton" onClick={comprobarUbicacion} disabled={ubicacion === 'comprobando'}>
            {ubicacion === 'comprobando' ? 'Comprobando…' : 'Comprobar mi ubicación'}
          </button>
        </div>
      ) : foto ? (
        <div className="prueba__preview">
          <img className="prueba__foto" src={foto} alt="La foto que acabas de elegir" />
          <button type="button" className="enlace" onClick={() => setFoto(null)}>
            cambiar foto
          </button>
        </div>
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

      <button
        type="button"
        disabled={esUbicacion ? ubicacion !== 'fuera' : !foto}
        onClick={() => alAportar(linea.trim() || undefined)}
      >
        {esUbicacion ? (ubicacion === 'fuera' ? 'Abrir la carta' : 'Comprueba tu ubicación para seguir') : foto ? 'Abrir la carta' : 'Elige una foto para seguir'}
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
  const { progreso, girarBombo, planHecho, modoRevision } = useSession()
  const [girando, setGirando] = useState(false)
  const [planVista, setPlanVista] = useState<Plan | null>(null)
  const pendiente = planVista ?? planPendiente(carta, progreso)
  const quedan = planesDisponibles(carta, progreso).length

  function girar() {
    setGirando(true)
    setTimeout(() => setGirando(false), 900)
    const elegido = girarBombo(carta.id)
    if (modoRevision) setPlanVista(elegido)
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
        marcar como hecho
      </button>
      <p className="apagado">{carta.bombo!.length - 1} planes más ahí dentro</p>
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
  const { status, cartas, progreso, abrir, aportarPrueba, modoRevision } = useSession()
  const [armada, setArmada] = useState(false)
  const [abriendo, setAbriendo] = useState(false)
  const [vistaPreviaAbierta, setVistaPreviaAbierta] = useState(false)
  const vinoDePrueba = useRef(false)

  const carta = cartas.find((c) => c.id === id)
  const estadoBase = carta ? estadoDeCarta(carta, progreso, new Date(), modoRevision) : null
  const estado = modoRevision && vistaPreviaAbierta ? 'abierta' : estadoBase

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
      ← Todas las cartas
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
          <p className="apagado">Cuando la abras quedará guardada para volver a leerla.</p>
          <button
            type="button"
            disabled={!armada || abriendo}
            className="sobre__boton"
            onClick={() => {
              setAbriendo(true)
              if (modoRevision) {
                setVistaPreviaAbierta(true)
                setAbriendo(false)
              }
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
          {modoRevision ? (
            'Vista de revisión · nada se guarda'
          ) : (
            <>
              {carta.escritaEl && <>Escrita en {carta.escritaEl} · </>}
              Abierta el {formatearFecha(apertura.at)}
            </>
          )}
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
