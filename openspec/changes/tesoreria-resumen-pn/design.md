# Design

## Context

- Motivación y alcance: `proposal.md`. Comportamiento: `specs/tesoreria-resumen-pn/spec.md`.
- `diariosOdoo()` (`src/lib/odooTesoreria.ts`) devuelve los diarios en pesos con su cuenta de liquidez (`cuentaId`); `cargarConfig()` da los habilitados y su orden.
- El Extracto (`src/lib/tesoreriaExtracto.ts`) ya suma saldos con `formatted_read_group` (con fallback a `search_read`), y `formatted_read_group` está en la lista de lecturas de `ot()`.
- Cheque propio en Odoo: `l10n_latam.check` (`issue_state` handed / debited / voided) con su línea pendiente en `outstanding_line_id` (relevado en producción: con varios cheques por pago, `l10n_latam_check` separa una línea por cheque). Se debita conciliando esa línea con una línea de extracto del banco.

## Goals / Non-Goals

**Goals:**
- Tres consultas agregadas a Odoo por período, sin traer líneas sueltas de los diarios.
- Reusar navegación, pestañas y suma de saldos del Extracto.

**Non-Goals:**
- Guardar saldos en la DB o cachearlos.
- Recalcular saldos por línea para detectar inconsistencias (la marca de "no cuadra" está fuera de alcance).

## Decisions

### D1. Saldos por diario

Dos `formatted_read_group` sobre `account.move.line` con `journal_id in habilitados`, `account_id in cuentas de liquidez`, `parent_state = posted`, agrupados por `journal_id` con `balance:sum`: uno con `date < desde` (saldo al inicio) y otro con `date` en `[desde, hasta]` (movimientos). Final = inicio + movimientos. Diario sin grupo en el resultado = 0.

Se generaliza la suma del Extracto a `sumaBalancePorDiario(domain)` (agrupada por `journal_id`, mismo fallback a `search_read` paginado agrupando en memoria) y el Extracto la usa con un solo diario. Alternativa descartada: llamar a la suma del Extracto una vez por diario (2 × N consultas).

### D2. Cheques Propios

Se calcula **por cheque** (`l10n_latam.check` con `payment_method_code = own_checks` de los diarios habilitados), no por pago: con varios cheques, `l10n_latam_check` separa el pendiente en una línea por cheque (`outstanding_line_id`) y el pago puede figurar `paid` con cheques todavía `handed`.

- **Emisión** = fecha del pago (`payment_id.date`). **Débito** = fecha de la línea que concilia `outstanding_line_id` (por `matching_number`). `handed` = sin débito; `voided` no se lee.
- Pendiente a una fecha D = suma de `amount` de los cheques emitidos hasta D cuyo débito no ocurrió hasta D.
- Se leen los `handed` emitidos hasta `hasta` y los `debited` emitidos desde un año antes de `desde` (un cheque no queda más de 360 días sin debitar).
- Inicio = pendiente al día anterior a `desde`; final = pendiente a `hasta`; movimientos = final − inicio. Todo en negativo.
- Un `debited` sin conciliación encontrada (dato inconsistente en Odoo) se toma debitado en su fecha de emisión.

Alternativas descartadas: saldo de la cuenta 1.4.6 (la comparten los pagos manuales) y estado del pago (`paid` no implica débito).

### D3. API, hook y pantalla

- `src/lib/tesoreriaResumen.ts` con `armarResumen(periodo, fecha)` → `{ odooDisponible, desde, hasta, filas: [{ diarioId?, nombre, inicio, movimientos, final }], cheques: { inicio, movimientos, final }, total: { inicio, movimientos, final } }`. Odoo caído (`OdooTesoreriaError` con `ambiguo`) → `odooDisponible: false` sin cifras.
- `GET /api/tesoreria/resumen?periodo=&fecha=` con `withAuth(..., { roles: ["ADMIN", "TESORERO"] })`, validación igual a `/api/tesoreria/movimientos`.
- Hook `useTesoreriaResumen(periodo, fecha)` con `placeholderData: keepPreviousData` y clave `queryKeys.tesoreria.resumen(periodo, fecha)`; las mutaciones ya invalidan el prefijo `["tesoreria"]`.
- `src/app/(app)/tesoreria/resumen/page.tsx`: `PestanasTesoreria`, subtítulo "Resumen PN", `NavPeriodo`, tabla con columna del nombre fija; fila de diario es un enlace a `/tesoreria/extracto?diario=&periodo=&fecha=`. Importes con `Monto` (rojo/verde); el 0 se muestra como 0,00.
- `PestanasTesoreria` suma la pestaña "Resumen PN" (`/tesoreria/resumen`).

### D4. Permisos

Mismo criterio que el Extracto: el prefijo `/tesoreria` ya está cubierto en `src/proxy.ts` y el Sidebar; se agrega `withAuth` en la ruta y la fila en `docs/arquitectura.md`.

## Risks / Trade-offs

- [`formatted_read_group` agrupado por `journal_id`] → verificado en producción (2026-10-29, solo lectura): devuelve `journal_id` como `[id, nombre]` y `balance:sum`; coincide con la suma por `search_read` en 15 diarios y 2.694 líneas. El fallback queda por si cambia la firma.
- [Débito de cheque propio cargado en Odoo sin conciliar con la línea del cheque] → el cheque sigue `handed` y figura pendiente; mismo criterio que la Vista General y se corrige conciliando en Odoo.
- [Cheque `debited` emitido más de un año antes de `desde`] → fuera de la lectura acotada, pero ya no estaba pendiente en el período, así que no cambia ningún saldo.
- [Cuenta de liquidez compartida entre diarios] → se filtra por diario y cuenta a la vez.

## Migration Plan

Sin migración de datos ni de schema. Rollback = revertir el código.
