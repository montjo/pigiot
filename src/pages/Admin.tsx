import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sha256Hex } from '../lib/crypto'
import { isFirebaseConfigured } from '../lib/firebase'
import { olvidarLocal, verProgreso } from '../lib/progress'
import { useSession } from '../lib/session-context'
import { formatearFecha } from '../lib/estado'
import { contar } from '../lib/economia'
import { cargarFotos } from '../lib/fotos'
import { PROGRESO_VACIO, type FotoAlbum, type Progreso } from '../lib/tipos'

const HASH = import.meta.env.VITE_ADMIN_PASSWORD_HASH ?? ''

const dias = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

/** Las fotos que ha ido subiendo, descifradas con la clave de las cartas. */
function Fotos({ clave }: { clave: CryptoKey }) {
  const [fotos, setFotos] = useState<FotoAlbum[] | null>(null)

  useEffect(() => {
    let vivo = true
    let urls: string[] = []
    cargarFotos(clave)
      .then((lista) => {
        if (!vivo) return
        // Si alguna no descifra (foto de otra época, o de una prueba) se calla:
        // mejor no pintarla que enseñar un hueco gris sin explicación.
        const buenas = lista.filter((f) => f.url)
        urls = buenas.map((f) => f.url!)
        setFotos(buenas)
      })
      .catch((e) => {
        console.warn('No se han podido cargar las fotos.', e)
        if (vivo) setFotos([])
      })
    return () => {
      vivo = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [clave])

  if (!fotos?.length) return null

  return (
    <section className="diario">
      <h2>Sus fotos</h2>
      <ul className="rejilla">
        {fotos.map((foto) => (
          <li key={foto.id}>
            <img src={foto.url} alt={foto.meta?.pie ?? ''} loading="lazy" />
            <span className="apagado">{formatearFecha(foto.at)}</span>
            {foto.meta?.pie && <span className="rejilla__pie">«{foto.meta.pie}»</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Deja este aparato como nuevo. Hay que hacerlo ANTES de borrar el documento en
 * la consola, o al abrir la web se vuelve a subir lo que hubiera aquí guardado.
 */
function OlvidarDispositivo({ progressId }: { progressId: string }) {
  const [seguro, setSeguro] = useState(false)

  return (
    <section className="diario">
      <h2>Dejar este aparato como nuevo</h2>
      <p className="apagado">
        Borra la copia que hay en <strong>este</strong> navegador: aperturas, pruebas, días,
        tiradas y la intro. La copia de la nube no se puede borrar desde aquí; eso se hace en la
        consola de Firebase, y hay que hacerlo <strong>después</strong> de esto, porque si no la
        web vuelve a subir lo de aquí al abrirse.
      </p>
      {seguro ? (
        <>
          <button
            type="button"
            onClick={() => {
              olvidarLocal(progressId)
              window.location.reload()
            }}
          >
            Sí, bórralo de este aparato
          </button>
          <button type="button" className="enlace" onClick={() => setSeguro(false)}>
            mejor no
          </button>
        </>
      ) : (
        <button type="button" className="enlace" onClick={() => setSeguro(true)}>
          borrar el progreso de este aparato
        </button>
      )}
    </section>
  )
}

export default function Admin() {
  const { progressId, cartas, clave } = useSession()
  const [dentro, setDentro] = useState(false)
  const [password, setPassword] = useState('')
  const [fallo, setFallo] = useState(false)
  const [progreso, setProgreso] = useState<Progreso | null>(null)

  useEffect(() => {
    if (!dentro || !progressId) return
    let cancelado = false
    let parar = () => {}
    verProgreso(progressId, setProgreso).then((fn) => {
      if (cancelado) fn()
      else parar = fn
    })
    return () => {
      cancelado = true
      parar()
    }
  }, [dentro, progressId])

  if (!dentro) {
    return (
      <main className="pantalla pantalla--centro">
        <form
          className="puerta"
          onSubmit={async (e) => {
            e.preventDefault()
            const ok = HASH !== '' && (await sha256Hex(password.trim())) === HASH
            setDentro(ok)
            setFallo(!ok)
            setPassword('')
          }}
        >
          <h1>Progreso</h1>
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
          <button type="submit">Ver</button>
          {fallo && (
            <p className="error">
              {HASH === '' ? 'Falta configurar VITE_ADMIN_PASSWORD_HASH.' : 'Contraseña incorrecta.'}
            </p>
          )}
          <Link to="/" className="enlace">
            ← volver
          </Link>
        </form>
      </main>
    )
  }

  const p = progreso ?? PROGRESO_VACIO
  const cuenta = contar(p, cartas)
  const titulo = (id: string) => cartas.find((c) => c.id === id)?.titulo ?? id
  const abiertas = Object.entries(p.opened).sort(([, a], [, b]) => (a.at < b.at ? 1 : -1))

  const pendientes = Object.entries(p.sorteos).flatMap(([cartaId, lista]) =>
    lista
      .filter((s) => !s.hechoAt)
      .map((s) => {
        const carta = cartas.find((c) => c.id === cartaId)
        const plan = carta?.bombo?.find((x) => x.id === s.planId)
        return { plan: plan?.plan ?? s.planId, con: plan?.con.join(' y ') ?? '', dias: dias(s.at) }
      }),
  )

  const proximas = cartas
    .filter((c) => c.desde && new Date(`${c.desde}T00:00:00`) > new Date())
    .sort((a, b) => (a.desde! < b.desde! ? -1 : 1))

  return (
    <main className="pantalla">
      <Link to="/" className="volver">
        ← volver
      </Link>
      <header className="cabecera">
        <h1>Progreso</h1>
        <p className="apagado">
          {abiertas.length} {abiertas.length === 1 ? 'carta abierta' : 'cartas abiertas'}
          {p.tutorialAt && ' · ha visto la intro'}
        </p>
        <p className="apagado">
          {cuenta.saldo} créditos · {Object.keys(p.dias ?? {}).length} días por aquí
          {cuenta.racha > 0 && ` · racha de ${cuenta.racha}`} ·{' '}
          {Object.keys(p.tiradas ?? {}).length} tiradas
        </p>
        {/* Recarga entera: el modo ensayo se decide antes de montar la sesión. */}
        <p>
          <a className="enlace" href={`${import.meta.env.BASE_URL}?ensayo`}>
            ver la web como el primer día →
          </a>
        </p>
      </header>

      {!isFirebaseConfigured && (
        <p className="error">
          Firebase no está configurado en este build: solo se ve el progreso de este dispositivo.
        </p>
      )}

      {cartas.length === 0 && (
        <p className="apagado">
          Entra antes con la contraseña de las cartas para ver los títulos en vez de los ids.
        </p>
      )}

      <ul className="diario">
        {abiertas.map(([id, e]) => (
          <li key={id}>
            {titulo(id)}
            <span className="apagado">
              {' '}
              · {formatearFecha(e.at)} · {e.device}
              {p.pruebas[id]?.lineas?.map((linea, n) => <span key={n}> · «{linea}»</span>)}
            </span>
          </li>
        ))}
      </ul>
      {abiertas.length === 0 && <p className="apagado">Todavía no ha abierto ninguna.</p>}

      {clave && <Fotos clave={clave} />}

      <OlvidarDispositivo progressId={progressId} />

      {pendientes.length > 0 && (
        <section className="diario">
          <h2>Planes pendientes</h2>
          <ul>
            {pendientes.map((x, i) => (
              <li key={i}>
                {x.plan} con {x.con}
                <span className="apagado"> · lleva {x.dias} días esperando</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {proximas.length > 0 && (
        <section className="diario">
          <h2>Se desbloquean pronto</h2>
          <ul>
            {proximas.map((c) => (
              <li key={c.id}>
                {c.titulo}
                <span className="apagado"> · el {formatearFecha(`${c.desde}T00:00:00`)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
