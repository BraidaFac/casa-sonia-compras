# Design

## Context

- Motivación y alcance: `proposal.md`. Comportamiento: `specs/tesoreria-vista-extracto/spec.md`.
- La Vista General (`src/lib/tesoreriaVista.ts`, cambio `tesoreria`) ya lee de Odoo las `account.move.line` de la cuenta de liquidez (`default_account_id`) de cada diario habilitado, publicadas, en el rango del período, y las atribuye a una operación de la app por la referencia `TES-{id}-{paso}` (`opDeRef`) o a un asiento externo.
- `diariosOdoo()` ya filtra los diarios en pesos (R58 se cumple sin código nuevo). `rango()` resuelve día / mes / año.
- La app crea todos sus movimientos como líneas de extracto (`account.bank.statement.line`) y verifica `is_reconciled` al ejecutar (`src/lib/tesoreriaPasos.ts`).
- No hay escrituras: es una pantalla de lectura sobre Odoo y la DB.

## Goals / Non-Goals

**Goals:**
- Reusar la lectura y las utilidades de la Vista General; no duplicar la lógica de atribución por referencia.
- Una sola llamada al API por cambio de diario / período.

**Non-Goals:**
- Unificar `armarVista` y el extracto en una sola función genérica: tienen agrupaciones distintas (matriz por diario vs. lista de un diario).
- Cachear saldos en la DB.

## Decisions

### D1. Lectura (`src/lib/tesoreriaExtracto.ts`)

`armarExtracto(diarioId, desde, hasta)` (quien llama resuelve el período con `rango()`; un rango personalizado llega tal cual):

1. Validar que `diarioId` esté entre los diarios habilitados de `cargarConfig()` y en `diariosOdoo()` (pesos); si no, error 400.
2. **Saldo inicial**: suma de `balance` de `account.move.line` con `account_id` = cuenta de liquidez del diario, `journal_id` = diario, `parent_state = posted`, `date < desde`. Con `formatted_read_group` (agregado `balance:sum`) para no traer miles de líneas; es una sola fila.
3. **Líneas del período**: mismo dominio con `date` en `[desde, hasta]`, campos `move_id, balance, name, partner_id, date, ref, statement_line_id, create_date`, orden `date asc, id asc`.
4. **Conciliación**: `account.bank.statement.line` de los `statement_line_id` leídos, campo `is_reconciled`. Línea sin `statement_line_id` (asiento directo a la cuenta del diario) = conciliada.
5. **Agrupación**: clave `op-{id}` si `opDeRef(ref)` da una operación, si no `ml-{id de la línea}` (una fila por línea externa). Importe = suma de `balance`; conciliado = todas conciliadas; fecha y orden = los de la primera línea del grupo.
6. **Etiqueta y contacto**: filas de la app con `etiqueta()` y `contactoNombre` de `tesoreriaOperacion` (una consulta Prisma por los ids encontrados); externas con `name` y `partner_id` de la línea.
7. **Balance**: acumulado en el servidor recorriendo las filas ordenadas desde el saldo inicial. Saldo final = inicial + suma del período.

Respuesta: `{ odooDisponible, diario, desde, hasta, saldoInicial, saldoFinal, filas: [{ key, clase: "APP" | "EXTERNO", operacionId?, moveId?, fecha, etiqueta, contacto, importe, balance, conciliado }], odooUrl }`.

Alternativa descartada: reusar `leerPartes` de la Vista General. Agrupa por asiento para la matriz, no trae el estado de conciliación ni el saldo previo y lee todos los diarios; adaptarla complica la Vista General.

### D2. Filtro y TOTAL en el cliente

El filtro "Solo sin conciliar" y la suma del TOTAL se calculan en el cliente sobre `filas`; el Balance de cada fila viene del servidor y no cambia con el filtro. El Balance del TOTAL es `saldoFinal`. Evita una segunda consulta al activar el filtro.

### D3. API y hook

- `GET /api/tesoreria/extracto?diario=&desde=&hasta=` con `withAuth(..., { roles: ["ADMIN", "TESORERO"] })`; valida formato `YYYY-MM-DD`, `desde <= hasta` y `desde <= hoy` (hora de Argentina; `hasta` puede ser futuro porque Mes y Año en curso terminan después de hoy); errores `{ error }` con 400.
- Odoo caído (`OdooTesoreriaError` con `ambiguo`) → `{ odooDisponible: false }` sin filas, igual que `armarVista`.
- Hook `useTesoreriaExtracto(diario, desde, hasta)` en `src/hooks/useTesoreria.ts`; clave `queryKeys.tesoreria.extracto(diario, desde, hasta)`. Las mutaciones de operaciones que ya invalidan `["tesoreria", "movimientos"]` invalidan también `["tesoreria", "extracto"]`.

### D4. Pantalla y navegación

- `src/app/(app)/tesoreria/extracto/page.tsx`. Estado en la URL (`?diario=&periodo=&fecha=`, o `?diario=&periodo=rango&desde=&hasta=` con rango personalizado) para que las pestañas conserven período y fecha y el enlace sea compartible. Con rango, las pestañas enlazan `periodo=dia&fecha={hasta}` (las otras vistas no entienden rangos).
- Pestañas "Vista General / Extracto" como un componente chico en `src/components/tesoreria/` usado por las dos páginas; enlazan con los mismos `periodo` y `fecha`. La Vista General pasa a leer y escribir `periodo` y `fecha` en la URL (hoy son estado local).
- La navegación de período (anterior / siguiente / selector) se extrae de `tesoreria/page.tsx` (`mover`, `tituloPeriodo`, controles) a un componente compartido para no copiarla.
- Clic en fila de la app → `DialogoOperacion` (el mismo de la Vista General). Fila externa → `${odooUrl}/odoo/account.move/{moveId}` en pestaña nueva; `odooUrl` lo devuelve el API (sale de `ODOO_URL`, no se expone como variable pública).
- Colores e importes con `Monto` / `fmt` de `src/components/tesoreria/comunes.tsx`.

### D5. Permisos

`src/proxy.ts` y el Sidebar ya cubren el prefijo `/tesoreria` (TESORERO solo ve Tesorería; MANAGER y empleados bloqueados), el Sidebar marca activo por prefijo. Solo se agrega `withAuth` en la ruta nueva y la fila en la matriz de `docs/arquitectura.md`.

### D6. Selector de rango (`src/components/ui/DateRangeInput.tsx`)

- Envoltorio de `DatePickerInput type="range"` de `@mantine/dates` (ya instalado): locale `es`, formato `DD/MM/YYYY`, `allowSingleDateInRange`, `maxDate` = hoy, 2 columnas en escritorio y 1 en celular (375 px). Llama a `onChange` solo con las dos fechas elegidas (Mantine emite `[inicio, null]` al primer clic).
- Muestra siempre el rango efectivo: con Día / Mes / Año, el que resuelve `rango()`; elegir un rango pasa a `periodo=rango`. Tocar un atajo con rango personalizado lo aplica sobre `fecha = hasta`.
- Anterior / siguiente: con atajos, `mover()` como hoy; con rango, desplaza el mismo largo en días (`sumarDias`), con siguiente deshabilitado si el nuevo `hasta` supera hoy.
- El Extracto arma sus propios controles con el selector nuevo y `mover()`; `NavPeriodo` no cambia, así la Vista General y el Resumen PN quedan igual. Si `rango()` arrastra código de servidor al cliente, se mueve a `src/lib/tesoreria.ts`.
- Alternativa descartada: un parámetro de rango en `src/components/ui/DateInput.tsx`. Su `onChange` es de una sola fecha y lo usan otras pantallas; tipar las dos formas complica un componente de 30 líneas.

## Risks / Trade-offs

- [Rango personalizado muy largo] → mismo aviso de `truncado` al superar el límite de líneas; no se agrega tope de días.

- [`formatted_read_group` con firma distinta a la esperada en Odoo 19] → verificarlo en la primera tarea contra Odoo; si falla, sumar con `search_read` de `balance` paginado (lento solo en diarios con mucha historia).
- [Un diario con miles de líneas en el año] → mismo límite que la Vista General (5.000 líneas); si se supera, la respuesta lo avisa en vez de cortar en silencio.
- [Una operación de la app con líneas en fechas distintas en el mismo diario] → se agrupan por operación igual (fecha de la primera); hoy ninguna de las 9 operaciones lo hace en un mismo diario.
- [Asiento directo a la cuenta del diario mostrado como conciliado] → criterio elegido porque no hay nada que conciliar; si el contador lo quiere distinto, cambia solo el paso 4 de D1.
- [Cuenta de liquidez compartida entre diarios] → se filtra por `journal_id` y cuenta a la vez, como la Vista General.

## Migration Plan

Sin migración de datos ni de schema. Despliegue normal; rollback = revertir el código (no deja datos).
