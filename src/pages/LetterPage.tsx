import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useSession } from '../lib/session-context'
import { cargarMiniatura, subirFoto } from '../lib/fotos'
import {
  estadoDeCarta,
  formatearFecha,
  introPendiente,
  planPendiente,
  planesDisponibles,
} from '../lib/estado'
import { NOMBRE_TIPO, pruebaVaDespues, type Carta, type Plan, type PruebaAportada } from '../lib/tipos'

const ARMADO_MS = 700

function PanelPrueba({
  carta,
  despues = false,
  alAportar,
}: {
  carta: Carta
  /** true cuando el QUEST va al final de la carta, ya leída. */
  despues?: boolean
  alAportar: (datos: { lineas: string[]; fotoId?: string; saltada?: boolean }) => void
}) {
  const { clave } = useSession()
  const prueba = carta.prueba!
  const preguntas = prueba.preguntas ?? []
  const [archivo, setArchivo] = useState<File | null>(null)
  const [foto, setFoto] = useState<string | null>(null)
  const [respuestas, setRespuestas] = useState<string[]>(() => preguntas.map(() => ''))
  const [subiendo, setSubiendo] = useState(false)
  const [falloAlSubir, setFalloAlSubir] = useState(false)
  const [salida, setSalida] = useState(false)
  const [ubicacion, setUbicacion] = useState<'sin-comprobar' | 'comprobando' | 'fuera' | 'dentro' | 'error'>('sin-comprobar')

  useEffect(() => {
    const t = setTimeout(() => setSalida(true), 8000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto) }, [foto])

  const esUbicacion = Boolean(prueba.ubicacion)
  const pideArchivo = Boolean(prueba.pide) && !esUbicacion
  // La primera pregunta es la que importa; las demás, si quiere.
  const contestada = preguntas.length === 0 || respuestas[0].trim().length > 0
  const listo = (esUbicacion ? ubicacion === 'fuera' : pideArchivo ? Boolean(foto) : true) && contestada

  /**
   * La foto se guarda cifrada antes de dar la prueba por buena, pero si falla
   * la subida no se le deja encerrado: puede reintentar o seguir sin ella.
   */
  async function enviar() {
    const lineas = respuestas.map((r) => r.trim()).filter(Boolean)
    if (!archivo || !clave) {
      alAportar({ lineas })
      return
    }
    setSubiendo(true)
    setFalloAlSubir(false)
    try {
      const fotoId = await subirFoto(clave, archivo, {
        cartaId: carta.id,
        pie: lineas[0],
        ancla: carta.tipo === 'primera',
      })
      alAportar({ lineas, fotoId: fotoId ?? undefined })
    } catch (causa) {
      console.warn('No se ha podido guardar la foto.', causa)
      setFalloAlSubir(true)
    } finally {
      setSubiendo(false)
    }
  }

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
    <section className={despues ? 'quest' : 'prueba'}>
      <p className="prueba__etiqueta">{despues ? 'Y ahora te toca a ti' : 'Antes de abrir'}</p>
      {despues ? (
        <p className="quest__que">{prueba.texto}</p>
      ) : (
        <>
          <h1>{carta.titulo}</h1>
          <p className="prueba__que">{prueba.texto}</p>
        </>
      )}

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
      ) : !pideArchivo ? null : foto ? (
        <div className="prueba__preview">
          <img className="prueba__foto" src={foto} alt="La foto que acabas de elegir" />
          <button
            type="button"
            className="enlace"
            onClick={() => {
              setFoto(null)
              setArchivo(null)
            }}
          >
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
              if (f) {
                setArchivo(f)
                setFoto(URL.createObjectURL(f))
              }
            }}
          />
          <span>Elegir la foto</span>
        </label>
      )}

      {preguntas.map((pregunta, i) => (
        <label className="prueba__linea" key={i}>
          {pregunta}
          <textarea
            rows={2}
            maxLength={700}
            value={respuestas[i]}
            onChange={(e) =>
              setRespuestas((r) => r.map((v, n) => (n === i ? e.target.value : v)))
            }
          />
        </label>
      ))}

      <button type="button" disabled={!listo || subiendo} onClick={enviar}>
        {subiendo
          ? 'Guardando la foto…'
          : despues
            ? listo
              ? 'Enviárselo'
              : pideArchivo && !foto
                ? 'Elige la foto para seguir'
                : 'Contesta para seguir'
            : esUbicacion
              ? ubicacion === 'fuera'
                ? 'Abrir la carta'
                : 'Comprueba tu ubicación para seguir'
              : listo
                ? 'Abrir la carta'
                : pideArchivo && !foto
                  ? 'Elige una foto para seguir'
                  : 'Contesta para seguir'}
      </button>

      {falloAlSubir && (
        <>
          <p className="error">
            No hemos podido guardar la foto. Si tienes mala cobertura, prueba otra vez en un
            rato.
          </p>
          <button
            type="button"
            className="enlace"
            onClick={() => alAportar({ lineas: respuestas.map((r) => r.trim()).filter(Boolean) })}
          >
            seguir sin guardar la foto
          </button>
        </>
      )}

      {salida && !despues && (
        <button
          type="button"
          className="enlace"
          onClick={() => alAportar({ lineas: [], saltada: true })}
        >
          se me está atragantando, ábrela igual
        </button>
      )}
    </section>
  )
}

/** La foto que subió, descifrada otra vez para que pueda volver a verla. */
function FotoGuardada({ id }: { id: string }) {
  const { clave } = useSession()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!clave) return
    let vivo = true
    let suya: string | null = null
    cargarMiniatura(clave, id)
      .then((foto) => {
        if (!vivo || !foto?.url) return
        suya = foto.url
        setUrl(foto.url)
      })
      .catch((e) => console.warn('No se ha podido recuperar la foto.', e))
    return () => {
      vivo = false
      if (suya) URL.revokeObjectURL(suya)
    }
  }, [clave, id])

  if (!url) return null
  return (
    <figure className="quest__foto">
      <img src={url} alt="La foto que subiste con esta carta" loading="lazy" />
    </figure>
  )
}

/**
 * Lo que él puso en esta carta —la foto y lo que escribió—, ya esté abierta
 * desde antes (la prueba iba primero) o lo haya contado al final.
 */
function Aportado({ carta, aportada }: { carta: Carta; aportada: PruebaAportada }) {
  const preguntas = carta.prueba?.preguntas ?? []
  // Con la salida de emergencia se puede abrir una carta sin aportar nada.
  if (!aportada.fotoId && !aportada.lineas?.length) return null

  return (
    <section className="quest quest--hecho">
      <p className="prueba__etiqueta">
        {pruebaVaDespues(carta) ? 'Ya nos lo has contado' : 'Con esto la abriste'}
      </p>
      {aportada.fotoId && <FotoGuardada id={aportada.fotoId} />}
      {aportada.lineas?.length ? (
        <dl className="quest__respuestas">
          {aportada.lineas.map((linea, i) => (
            <div key={i}>
              {preguntas[i] && <dt>{preguntas[i]}</dt>}
              <dd>{linea}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="apagado">No escribiste nada, y también vale.</p>
      )}
      <p className="apagado">El {formatearFecha(aportada.at)}</p>
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
  if (!carta || estado === 'futura' || estado === 'sellada') return <Navigate to="/" replace />

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
          alAportar={(datos) => {
            vinoDePrueba.current = true
            aportarPrueba(carta.id, datos)
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

        {/*
          Lo que aportó, si aportó algo, y si no el QUEST de las que piden algo
          DESPUÉS de haberlas leído.
        */}
        {carta.prueba &&
          (progreso.pruebas[carta.id] ? (
            <Aportado carta={carta} aportada={progreso.pruebas[carta.id]} />
          ) : (
            pruebaVaDespues(carta) && (
              <PanelPrueba
                carta={carta}
                despues
                alAportar={(datos) => aportarPrueba(carta.id, datos)}
              />
            )
          ))}

        {carta.tipo === 'primera' &&
          (introPendiente(progreso) ? (
            <section className="siguiente">
              <p className="siguiente__eti">Y ahora</p>
              <p className="siguiente__que">
                Un minuto para contarte cómo va esto. Al acabar se abre el resto del mazo.
              </p>
              <Link to="/intro" className="boton boton--tipo">
                Cómo funciona
              </Link>
            </section>
          ) : (
            <Link to="/como-va" className="enlace">
              y ahora, cómo va esto →
            </Link>
          ))}
      </article>
    </main>
  )
}
