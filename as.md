# Feature: Edición de Órdenes de Compra ya cargadas en Odoo

## 1. Contexto

La app actual permite crear órdenes de compra (OC) contra Odoo vía API, descubriendo y dando de alta/editando productos (con sus variantes obligatorias: color, talle, marca, etc.) según necesidad. El alcance termina cuando la OC queda creada en Odoo.

**Problema real que dispara esta feature:** el cliente crea una OC para un proveedor con N productos con variantes. El proveedor responde que no tiene stock de ciertas combinaciones (ej: talle 40 y 42 de dos productos, color Amarillo de otro). Hoy esto obliga al cliente a ir a Odoo manualmente a editar la OC y los productos. Se busca que esa edición se pueda hacer desde la misma app, reusando el formulario de creación, y que el guardado impacte directamente en Odoo (modelos + PDF).

## 2. Alcance

### Incluye
- Pantalla nueva de **listado de OC** recuperadas de Odoo (con filtros mínimos: proveedor, estado, fecha, número de OC).
- Selección de una OC → **hidratación** del formulario de creación existente con todos los datos ya cargados en Odoo.
- Edición de:
  - Cantidades y precios de líneas existentes.
  - Eliminación de líneas (productos) completas.
  - Eliminación de variantes específicas dentro de un producto (ej: sacar talle 40 pero dejar el 38).
  - Agregado de líneas nuevas (productos/variantes que no estaban en la OC original).
  - Alta de nuevas variantes en Odoo si no existen (mismo mecanismo que ya usa la app en creación).
  - Edición de atributos del producto si se necesita (ej: dar de baja el color Amarillo a nivel producto, no solo en esta OC).
  - Datos generales de la OC: proveedor, sucursal/almacén destino, empleado/comprador, fecha esperada, notas.
- Al guardar:
  - Update (no recrear la OC, mismo `id`/`name`).
  - Alta o update de `product.template` / `product.product` / `product.attribute.value` según corresponda.
  - Regeneración del PDF de la OC.
- Validaciones de consistencia antes de mandar el write a Odoo (ver sección 10).
- Trazabilidad mínima de qué se editó (ver sección 11).

### No incluye (fuera de alcance, explicitar para que no se infle el ticket)
- Flujo de aprobación/autorización interna antes de mandar la edición a Odoo (se asume que quien edita tiene permiso).
- Notificación automática al proveedor de los cambios (eso lo sigue haciendo el cliente por su canal habitual).
- Conciliación contra factura/recepción de mercadería (`stock.picking`, `account.move`). Si la OC ya tiene recepciones o facturas asociadas, ver regla de bloqueo en sección 6.5.
- Versionado/histórico de PDFs anteriores (se elimina el viejo, no se archiva — salvo que se decida lo contrario en sección 8.3).
- Edición múltiple (bulk) de varias OC a la vez.

## 3. Flujo actual vs flujo nuevo

**Actual (creación):**
1. Usuario completa formulario → selecciona proveedor, sucursal, empleado, agrega productos/variantes, cantidades, precios.
2. App resuelve productos: busca en Odoo, si no existe lo crea (`product.template` + variantes), si existe lo reusa.
3. App crea `purchase.order` + `purchase.order.line` en Odoo.
4. App genera PDF (reporte de Odoo) y listo, fin del flujo.

**Nuevo (edición):**
1. Usuario entra a "Mis Órdenes de Compra" → ve listado traído de Odoo.
2. Selecciona una OC → app hace `read`/`search_read` de la OC y sus líneas → **hidrata** el mismo formulario de creación, pero en modo edición.
3. Usuario modifica lo que necesite (cantidades, variantes, agrega/quita líneas).
4. Usuario guarda → app calcula el diff entre estado original y estado editado → ejecuta los `write`/`create`/`unlink` necesarios sobre Odoo → regenera PDF → borra PDF viejo.
5. Fin del flujo (igual que en creación, no hay paso adicional).

## 4. Pantallas y UX

### 4.1 Listado de Órdenes de Compra
- Trae de Odoo vía `search_read` sobre `purchase.order` (campos mínimos: `name`, `partner_id`, `date_order`, `state`, `amount_total`, `picking_type_id`/almacén).
- Filtros sugeridos: proveedor, estado (draft/sent/purchase), rango de fechas, número de OC.
- Cada fila con acción "Editar" que lleva al formulario hidratado.
- Indicar visualmente el `state` de la OC (borrador, enviada, confirmada) porque condiciona qué se puede editar (sección 6.5).

### 4.2 Hidratación del formulario
El mismo componente de creación debe poder recibir un payload "OC existente" y precargar:
- Cabecera.
- Líneas 
- Las imágenes 
- El formulario debe distinguir línea "original" vs línea "nueva" vs línea "modificada" vs línea "a eliminar" — esto es clave para el cálculo del diff al guardar (ver sección 7).

### 4.3 Edición de productos y variantes
- Por línea existente: permitir cambiar cantidad, precio, o **quitar** la línea.
- Por variante dentro de un producto: si el producto tiene combinaciones (ej: Remera Azul talle 38/40/42 como 3 líneas o como 1 línea con selector, según cómo lo maneje hoy la app en creación — mantener la misma UX), permitir destildar/eliminar combinaciones puntuales sin tocar el resto.
- Botón "Agregar producto" dentro del mismo formulario de edición, reusando el buscador/alta de producto que ya existe en creación.
- Si el usuario marca que un color/talle "ya no existe" a nivel producto (no solo en esta OC), dar la opción de propagarlo como baja de esa variante en `product.product` (archivar, no borrar — Odoo no deja eliminar variantes con movimientos asociados).

### 4.4 Guardado y confirmación
- Botón "Guardar cambios" (no "Crear OC").
- Antes de confirmar, mostrar un resumen del diff: qué líneas se agregan, cuáles se quitan, cuáles cambian cantidad/precio. Esto evita updates accidentales y le da al usuario una confirmación clara de lo que va a impactar en Odoo.
- Tras confirmar: feedback de progreso (puede ser una secuencia de varias llamadas a Odoo) y resultado final con modal para decsrgar pdf

## 5. Datos a recuperar de Odoo (modelos y campos clave)
Analizar lo que utiliza en el codigo. 

## 6. Reglas de negocio para la edición

### 6.1 Modificar cantidad/precio de una línea existente
- Update directo de `purchase.order.line` (`write` con el `id` existente). No recrear la línea.

### 6.2 Variantes obligatorias (color, talle, marca, etc.)
Analizarlas del codigo
### 6.3 Alta de variante nueva durante la edición
- Mismo mecanismo ya existente en creación: si la combinación de atributos no existe, crear/actualizar `product.template.attribute.line` con el nuevo `value_ids` y dejar que Odoo genere la variante (`product.product`), o crearla explícitamente según cómo lo resuelva hoy la app.

### 6.4 Eliminar una línea completa
- `unlink` de la `purchase.order.line` correspondiente. Si la OC está confirmada (`state = 'purchase'`), ver 6.5 antes de permitirlo.

### 6.5 Estados de la OC en Odoo — regla crítica
Odoo permite editar libremente una OC en `draft` o `sent`. Una vez en `purchase` (confirmada) o con recepciones/facturas asociadas, modificar líneas puede generar inconsistencias (cantidades recibidas vs pedidas, facturación parcial, etc.).

Reglas propuestas:
- **`draft` / `sent`**: edición libre (agregar, quitar, modificar cualquier línea).
- **`purchase` sin recepción ni factura asociada**: edición permitida pero con advertencia.
- **`purchase` con alguna recepción (`stock.picking`) o factura (`account.move`) ya vinculada**: **bloquear edición de líneas afectadas** desde la app y mostrar mensaje claro indicando que esa OC tiene movimientos asociados y debe gestionarse manualmente en Odoo. (Decisión a validar con el cliente: se puede directamente bloquear toda la OC, o solo las líneas con movimiento — esto último es más complejo de implementar.)
- En todos los casos, antes de habilitar edición, la app debe consultar el `state` y la existencia de `stock.picking`/`account.move` relacionados.

## 7. Cómo se actualiza Odoo al guardar

1. App calcula el **diff** entre el snapshot original (lo que se leyó al hidratar) y el estado actual del formulario:
   - Líneas sin cambios → no se tocan.
   - Líneas modificadas (cantidad/precio) → `write` sobre `purchase.order.line`.
   - Líneas nuevas → `create` de `purchase.order.line` (y de producto/variante si corresponde, antes de la línea).
   - Líneas eliminadas → `unlink` de `purchase.order.line`.
   - Cambios de cabecera (proveedor, sucursal, empleado, fecha, notas) → `write` sobre `purchase.order`.
2. Orden de ejecución recomendado:
   1. Alta/edición de productos y variantes nuevas (`product.template`, `product.attribute.value`, `product.product`).
   2. Update de cabecera de la OC.
   3. Alta de líneas nuevas.
   4. Update de líneas modificadas.
   5. Baja de líneas eliminadas.
   6. Regeneración de PDF.
   7. Borrado de PDF(s) anterior(es).
3. Manejo de fallos parciales: si un paso falla a mitad de camino, la app debe informar exactamente qué se aplicó y qué no (Odoo no tiene transacciones atómicas cross-request desde un cliente externo vía API estándar). Conviene loguear cada operación con su resultado para poder reintentar o revertir manualmente si hace falta.

## 8. Manejo de PDF

### 8.1 Generación del nuevo PDF
- Disparar el reporte estándar de OC de Odoo (`report.purchase.order` o el que ya use la app en creación) vía `ir.actions.report` o el endpoint correspondiente, una vez aplicados todos los cambios.

### 8.2 Marcar como viejo el PDF anterior
- Buscar `ir.attachment` con `res_model='purchase.order'` y `res_id=<id de la OC>` generados por la app (filtrar por nombre/origen si conviven con adjuntos manuales de Odoo, para no borrar algo que subió un usuario de Odoo directamente).
- Modificarle el nombre a ese archivo para marcar que es no es el pdf actual, y si se puede recuperar el pdf anterior y hacerle una marca de agua sobre el pdf que diga ORDEN NO VALIDA, algo asi

### 8.3 Versionado (a decidir)
- Opción A (más trazable): se renombra/archiva el PDF viejo con un sufijo de fecha en vez de borrarlo, y se sube el nuevo como el "vigente". Esto da histórico de qué se le mandó al proveedor en cada versión, útil si después hay un reclamo de "esto no es lo que acordamos".

## 9. ¿Hace falta una base de datos propia?

Hoy la app es stateless / intermediaria liviana. Para esta feature puntual, **no es estrictamente necesaria** una DB propia: todo el estado (qué es "original" vs "editado") puede manejarse en el front/sesión, comparando contra lo leído de Odoo en el momento de hidratar.

Casos donde una DB (aunque sea liviana, ej. SQLite o una tabla simple) **sí ayudaría**:
- Si se quiere guardar un log/auditoría persistente de ediciones (quién cambió qué y cuándo) más allá de lo que Odoo registra nativamente (Odoo tiene `mail.message`/chatter y tracking de campos si están configurados con `tracking=True`, pero no siempre cubre todo).
- Si se implementa la Opción B de versionado de PDFs y se quiere indexar/listar versiones desde la app sin tener que parsear nombres de archivo en Odoo.
- Si se necesita lock de edición (evitar que dos usuarios editen la misma OC al mismo tiempo) — sin DB propia esto se podría resolver consultando `write_date` de la OC justo antes de guardar y comparando contra el que se leyó al hidratar (optimistic locking), sin necesidad de tabla propia.

**Recomendación:** arrancar sin DB propia, usando optimistic locking contra `write_date` de Odoo para detectar ediciones concurrentes. Evaluar agregar una tabla mínima solo si el cliente pide trazabilidad/histórico que Odoo no cubre.

## 10. Validaciones y manejo de errores

- Antes de habilitar guardado: validar que la OC no haya sido modificada por otro usuario/canal desde que se hidrató (comparar `write_date`). Si cambió, avisar y ofrecer recargar.
- Validar que no se esté dejando una línea con cantidad 0 o negativa (forzar eliminación de la línea en vez de cantidad 0).
- Validar que toda línea nueva tenga las variantes obligatorias completas (mismo check que ya existe en creación) antes de mandar a Odoo.
- Si falla el `write`/`create` de algún paso, mostrar error específico de Odoo (no un genérico) y dejar la OC en el estado parcial que haya quedado, indicando claramente qué se llegó a aplicar.
- Si la OC tiene recepciones/facturas asociadas (sección 6.5), bloquear antes de mostrar el formulario editable, con mensaje explicativo.

## 11. Permisos y trazabilidad

- Como mínimo, registrar en las notas (`notes` o un campo de log) o en el chatter de Odoo (`message_post`) un resumen de la edición: usuario de la app que editó, fecha, y qué cambió (aunque sea texto plano), para no depender de memoria humana ante un reclamo del proveedor.

## 12. Casos de borde a contemplar

- El producto que se quiere editar fue **eliminado/archivado en Odoo** desde que se creó la OC originalmente → la app debe detectarlo al hidratar y avisar, no romper el formulario.
- El proveedor de la OC fue dado de baja/cambiado en Odoo → mismo tratamiento.


## 13. Criterios de aceptación

- [ ] Existe una pantalla de listado de OC traídas en vivo desde Odoo, con filtros por proveedor/estado/fecha.
- [ ] Al seleccionar una OC, el formulario de creación se hidrata con todos sus datos (cabecera + líneas + variantes + imágenes).
- [ ] Se puede modificar cantidad/precio de líneas existentes y persiste correctamente en Odoo al guardar.
- [ ] Se puede eliminar una línea completa y se refleja como `unlink` en `purchase.order.line`.
- [ ] Se puede eliminar una variante puntual (ej: un talle) sin afectar el resto del producto.
- [ ] Se puede agregar una línea/producto/variante nueva durante la edición, reusando el alta de productos ya existente.
- [ ] Se puede eliminar o agregar imagenes a la variante.
- [ ] Al guardar, se regenera el PDF de la OC y se modifcia el PDF anterior asociado.
- [ ] Si la OC tiene recepciones o facturas asociadas, la edición se bloquea con mensaje claro.
- [ ] Si la OC fue modificada por otro canal desde que se hidrató, se detecta y se avisa antes de sobrescribir.
- [ ] Quedan registrados en Odoo (chatter o notas) los cambios realizados desde la app.

