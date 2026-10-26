# Tesorería — Fase 0: relevamiento de Odoo

Relevado el 2026-10-26 sobre **producción**, solo lectura (`search_read`, `search_count`, `fields_get`, `formatted_read_group`). Contrasta con [`tesoreria-odoo-v2.md`](tesoreria-odoo-v2.md).

## Instalación

- **Odoo 19.0 Enterprise** (`web_enterprise`, `accountant`, `account_accountant`).
- Localización **ADHOC**: `l10n_ar`, `l10n_ar_edi`, `l10n_ar_withholding` (retenciones de pago), `l10n_latam_check` (cheques propios, de terceros, diferidos y e-cheqs), `l10n_latam_invoice_document`, `l10n_ar_reports`.
- **No hay "grupo de pagos"** (`account.payment.group` no existe, tampoco `account_payment_pro`). Un `account.payment` = un diario = un método. Las retenciones van en el propio pago (`l10n_ar_withholding_ids`). → El riesgo de §4.3 (retención calculada por método) es real.
- Empresa: Casa Sonia Sociedad Simple, CUIT 30717060284, moneda ARS.
- **Sin fechas de bloqueo** contable (todas vacías).
- Cuenta de transferencias de liquidez (puente): **6.1 Movimiento entre Bancos**. Diario de diferencia de cambio: "Diferencia de cambio".

## Retenciones

- **No hay ningún impuesto de retención configurado** (ni de proveedor ni de cliente) y `l10n_ar.partner.tax` (padrones/alícuotas por contacto) está vacío. El módulo está instalado pero sin uso.
- Contradice D6 ("la empresa practica retenciones"): hoy Odoo no calcula ninguna.
- Impuestos de compra disponibles: IVA 21 / 21 incluido / 10,5 / 27 / 0 / exento / no gravado / no corresponde, impuesto interno, "Other taxes".

## Diarios (activos)

| Grupo | Diarios en Odoo | Nota vs spec |
|---|---|---|
| Efectivo | Efectivo Administracion; Efectivo Ruta, Centro, Quiver, Estribo | "Kiver" = **Quiver** |
| Bancos | Banco Bica, Banco ICBC | |
| Billeteras / cuentas de socios | Mercado Pago - Casa Sonia, Maxi - Mercado Pago, Vale - Mercado Pago, Andre - Bica, Mili - Bica, Cuenta Vale Financiera | todas tipo `bank` en ARS |
| USD | **Dolar USD Administracion** (único) | **No existe "Vale USD"** |
| Cheques | Cheques de Terceros, Cheques de Terceros Rechazados | Cheques propios = método "Cheques Propios" en cada banco/billetera |
| Cupones | Cupones a Liquidar Mercado Pago, Payway, Andre Clover, Mili Clover | P10: los "cupones" son **diarios**, no cuentas |

Métodos de pago: "Pago manual" en todos; "Cheques Propios" y "Cheques de terceros devueltos" en bancos, billeteras y cupones; "Nuevo cheque de Terceros" / "Cheque de Terceros Existente" en Cheques de Terceros.

## Multimoneda

- USD activo **sin ninguna cotización cargada** (`res.currency.rate` vacío; rate = 1). Todo movimiento en USD hoy se valúa 1 USD = 1 ARS.
- Bloquea la regla de §9.12 ("sin cotización del día → bloqueo"): hoy bloquearía siempre. P24 pasa a ser crítica.

## Extractos y conciliación

- **0 extractos** (`account.bank.statement`). Se usan líneas de extracto sueltas, sin extracto ni cierre. D3 ("un extracto por día con saldo inicial/final y cierre") no se practica hoy.
- Últimos 90 días: 3.357 líneas de extracto. ~95% son de las cajas locales (Ruta 1.375, Centro 918, Estribo 663, Quiver 301), cargadas por usuarios "Caja X". Tesorería propiamente dicha: ~100 líneas (Efectivo Admin. 28, Cheques de Terceros 21, Maxi MP 18, Cuenta Vale 14, Mili Bica 7, etc.).
- Sin conciliar: 681 líneas, casi todas de cajas locales contra **1.4.2 Cuenta transitoria**.
- Puente 6.1 con saldo ≠ 0 hoy (≈ $ 1.452.000 en Efectivo Administración).
- Modelos de conciliación automática: sin hallazgos relevantes (revisar en detalle si hace falta).

## Quién carga hoy

Usuarios internos de Odoo: Braida Maximo, Administracion - Gianlu, Caja Centro / Estribo / Quiver / Ruta. **No hay usuario de Mariano.** En 90 días, Máximo creó 1.073 líneas y 725 pagos; las cajas, el resto.

## Cheques

- `l10n_latam.check`: 66 cheques. Campos: número, banco, CUIT emisor, fecha de pago, importe, diario original/actual, operaciones, `issue_state` para propios (Entregado / Debitado / Anulado).
- El estado de un cheque de tercero se deriva del **diario actual** (Cheques de Terceros, Rechazados, banco depositado) y de sus operaciones; no hay un campo "estado" único.
- Pagos con estado `draft / in_process / paid / canceled / rejected`.
- Últimos 90 días: 15 pagos con cheque propio ICBC, 3 Bica; 17 altas de cheques de terceros, 6 entregas.

## Cuentas relevantes

95 activas (254 archivadas). Gastos: 34. Candidatas:

| Uso en la spec | Cuenta en Odoo |
|---|---|
| Puente | 6.1 Movimiento entre Bancos |
| Resultados financieros | 4.2.1 Resultados Financieros (una sola, de ingreso); 5.6.3 Intereses Pagados; 4.2.3 Intereses ganados |
| Retiros de socios | **3.3.1 Retiro Maximo, 3.3.2 Retiro Mariano** (solo dos socios) |
| Cheques rechazados | 1.1.91 Cheques Rechazados (+ diario y cuenta 1.1.1.01.002) |
| Diferencias de caja | 4.3.2 Diferencias de Caja, 5.7.2 / 5.7.5 / 5.7.7 |
| Diferencias de cambio | 4.3.3 |
| Retenciones y percepciones varias | 1.4.9 |
| Pagos / recibos pendientes | 1.4.6 / 1.4.8 |
| Cambio de cheques | **1.2.7 Cheques Recibidos y Efectivo Entregado**, **2.1.3 Cheque entregado y efectivo recibido** |
| Cheques propios | 2.1.2 Cheques diferidos a pagar (sin movimientos) |

## Práctica actual del cambio de cheques

Hay dos formas registradas:

**A — real, 21/10/2026 (Manelo, 2 cheques × $200.000):** cobro con "Nuevo cheque de Terceros" contra 1.2.1 Créditos por ventas (cuenta corriente de Manelo) + línea de extracto en Cheques de Terceros; pago en Efectivo Administración por $400.000 contra 1.2.1 + línea de extracto del 19/10. Manelo queda en 0. **No se registró ganancia** (efectivo = total de cheques). Coincide con el esquema de la spec (§10.8).

**B — prueba, 21/04/2026 (cheque $105, efectivo $100):** cobro con cheque nuevo contra **1.2.7 Cheques Recibidos y Efectivo Entregado** (sin pasar por la cuenta corriente); línea de extracto en Efectivo Administración: 1.2.7 (D 105) / Efectivo (H 100) / 4.2.1 Resultados Financieros (H 5). La 1.2.7 queda en 0. La 2.1.3 (sentido inverso) no tiene movimientos.

Cuál se adopta: pregunta C1 en [`tesoreria-decisiones.md`](tesoreria-decisiones.md).
