# Documentación

## Cómo trabajamos

1. Funcionalidad nueva o cambio → `/opsx:propose "<idea>"`: crea `openspec/changes/<nombre>/` con propuesta, diseño, specs delta y tareas.
2. Implementación → `/opsx:apply`.
3. Al terminar → `/opsx:archive`: aplica los deltas a `openspec/specs/` y mueve el cambio a `openspec/changes/archive/`.

Así `openspec/specs/` siempre describe la app tal como está.

## Specs vigentes (`openspec/specs/`)

| Módulo | Qué cubre |
|---|---|
| [autenticacion](../openspec/specs/autenticacion/spec.md) | login, logout, sesión, protección de rutas |
| [roles-permisos](../openspec/specs/roles-permisos/spec.md) | qué ve y hace cada rol |
| [empleados](../openspec/specs/empleados/spec.md) | ABM de empleados |
| [existencias](../openspec/specs/existencias/spec.md) | consulta de stock en el salón |
| [promociones](../openspec/specs/promociones/spec.md) | medios de pago, bancos, descuentos, promociones, vigentes |
| [ordenes-compra](../openspec/specs/ordenes-compra/spec.md) | borradores, confirmación en Odoo, PDF, edición, historial Odoo |
| [inventario](../openspec/specs/inventario/spec.md) | conteos y ajuste de stock en Odoo |

## Otros documentos

| Documento | Contenido |
|---|---|
| [arquitectura.md](arquitectura.md) | stack, estructura, matriz de permisos, Odoo, DB, deuda conocida |
| [producto.md](producto.md) | usuarios, propósito, principios de diseño |
| [diseno.md](diseno.md) | design system (tema, colores, tipografía) |
| [borradores/](borradores) | ideas de features todavía sin propuesta OpenSpec |
| [historico/](historico) | specs y planes anteriores a OpenSpec (pueden estar desactualizados) |

## Histórico (implementado salvo nota)

| Fecha | Feature |
|---|---|
| 2026-06-27 | Órdenes en DB local |
| 2026-06-29 | Códigos de barra |
| 2026-07-02 | Rediseño de inventario |
| 2026-07-16 | Inventario: color e historial de escaneo |
| 2026-07-19 | Modal de resumen de orden |
| 2026-07-20 | Empleados, auth y roles |
| 2026-07-22 | Performance de OrderGrid |
| 2026-08-01 | Paginación centralizada |
| 2026-08 | Existencias |
| 2026-08-17 | Hardening de seguridad de auth (tareas 1–7 registradas como completas; el resto sin verificar) |
| 2026-08-19 / 08-20 | Edición de artículos post-confirmación |
| 2026-09-04 | PDF de promociones bancarias |

## Borradores

| Archivo | Estado |
|---|---|
| [borradores/tesoreria-odoo-v2.md](borradores/tesoreria-odoo-v2.md) | Módulo de Tesorería. Spec base sin validar; en revisión punto por punto antes de la propuesta |
| [borradores/edicion-oc-odoo.md](borradores/edicion-oc-odoo.md) | Edición completa de OC ya cargadas en Odoo. Parcialmente cubierto por la edición post-confirmación; pendiente de propuesta |
