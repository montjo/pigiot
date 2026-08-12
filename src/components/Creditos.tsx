import { ECONOMIA, type Cuenta } from '../lib/economia'

/**
 * La barra de créditos. Siempre mide lo que falta para la SIGUIENTE tirada, no
 * el saldo entero: con 450 créditos enseña 50/200 y aparte «2 tiradas listas».
 */
export function BarraCreditos({ cuenta, compacta = false }: { cuenta: Cuenta; compacta?: boolean }) {
  const listas = cuenta.tiradasListas
  const haciaLaSiguiente = cuenta.saldo % ECONOMIA.tirada
  const parte = listas > 0 ? 1 : haciaLaSiguiente / ECONOMIA.tirada

  return (
    <div className={`creditos${compacta ? ' creditos--compacta' : ''}`}>
      <div className="creditos__cifras">
        <span className="creditos__saldo">
          {cuenta.saldo}
          <span className="creditos__unidad"> créditos</span>
        </span>
        {listas > 0 ? (
          <span className="creditos__listas">
            {listas} {listas === 1 ? 'tirada lista' : 'tiradas listas'}
          </span>
        ) : (
          <span className="creditos__faltan">faltan {cuenta.faltan}</span>
        )}
      </div>
      <div
        className={`creditos__barra${listas > 0 ? ' creditos__barra--llena' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={ECONOMIA.tirada}
        aria-valuenow={listas > 0 ? ECONOMIA.tirada : haciaLaSiguiente}
        aria-label="Créditos para la siguiente tirada"
      >
        <span style={{ transform: `scaleX(${parte})` }} />
      </div>
    </div>
  )
}
