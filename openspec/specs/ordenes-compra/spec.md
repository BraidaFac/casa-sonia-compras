# ordenes-compra Specification

## Purpose
Armar órdenes de compra artículo por artículo, guardarlas como borrador local y confirmarlas en Odoo, creando o actualizando productos, variantes, precios y proveedores. Incluye PDF, imágenes, duplicado, edición de artículos ya confirmados e historial de órdenes de Odoo. Implementación principal: `src/app/(app)/orders/**`, `src/app/api/local-orders/**`, `src/lib/odooOrderCreation.ts`, `src/lib/odooProducts.ts`, `src/lib/odooArticleUpdate.ts`, `src/lib/orderValidation.ts`, `src/lib/pdf.ts`, `src/components/orders/**`.

## Requirements

### Requirement: Ciclo de vida de la orden local
Cada orden SHALL existir en la tabla `orders` con estado `DRAFT`, `CONFIRMED` o `ERROR`. Solo la confirmación lleva a `CONFIRMED`; un fallo de confirmación lleva a `ERROR`; editar una orden en `ERROR` la devuelve a `DRAFT`.

#### Scenario: Crear borrador
- **WHEN** el usuario guarda una orden nueva con proveedor y fecha
- **THEN** se crea en `DRAFT` con cabecera (proveedor, marca, compradoras, sucursales, fecha), artículos (JSON sin imágenes base64), columnas de impresión y `createdById`

#### Scenario: Editar orden con error
- **WHEN** se guarda una orden en `ERROR`
- **THEN** vuelve a `DRAFT`

#### Scenario: Eliminar orden confirmada
- **WHEN** se intenta eliminar una orden `CONFIRMED`
- **THEN** el sistema responde 409; las órdenes `DRAFT` y `ERROR` sí se eliminan junto con sus imágenes temporales

### Requirement: Validación previa a confirmar
El sistema SHALL validar en cliente y servidor antes de confirmar: proveedor, marca, fecha, al menos un artículo, al menos una compradora, y por artículo nombre, categoría, atributo "Marca" con valor, al menos una cantidad mayor a 0 y referencia no usada en Odoo. El guardado de borrador solo valida proveedor, marca, fecha y un artículo, y solo en cliente.

#### Scenario: Confirmación incompleta
- **WHEN** se confirma una orden a la que le falta algún dato obligatorio
- **THEN** el servidor responde 422 con la lista `missing[]` y la UI muestra el modal de validación

### Requirement: Alta de productos en Odoo al confirmar
Al confirmar, el sistema SHALL crear los colores nuevos como `product.attribute.value` (requieren color base y HEX; los talles nunca se crean), crear o actualizar cada `product.template` con sus líneas de atributos, crear o actualizar `product.supplierinfo` (costo) y el ítem de la primera `product.pricelist` (precio de venta), y escribir códigos de barra por variante.

#### Scenario: Color nuevo sin datos
- **WHEN** un artículo trae un color nuevo sin color base o sin HEX
- **THEN** la confirmación falla con un error que nombra artículo y color

### Requirement: Confirmación en Odoo
Después del alta de productos, el sistema SHALL crear la `purchase.order` con una línea por variante con cantidad (sucursal y compradoras en campos `x_studio_*`), ejecutar `button_confirm`, adjuntar dos PDF (proveedor e interno) y sincronizar imágenes. Al terminar, la orden local pasa a `CONFIRMED` con `odooOrderId` y `odooOrderName`.

#### Scenario: Confirmación exitosa
- **WHEN** una orden válida se confirma
- **THEN** existe una orden de compra confirmada en Odoo con una línea por variante con cantidad, y la orden local queda `CONFIRMED`

#### Scenario: Fallo durante la creación
- **WHEN** falla un paso de la creación en Odoo
- **THEN** el sistema cancela y borra la orden de compra, borra los templates, supplierinfo e ítems de lista de precios creados en esa corrida, marca la orden local `ERROR` con `errorDetail` y responde 500
- **AND** los colores creados y las actualizaciones a productos existentes no se revierten

#### Scenario: Orden ya confirmada
- **WHEN** se confirma una orden que ya está `CONFIRMED`
- **THEN** el sistema responde 409

### Requirement: Imágenes de artículos
Mientras la orden no está confirmada, las imágenes SHALL guardarse en `public/uploads/temp/{orderId}/{articleId}/{color}/`. Al confirmar o editar un artículo confirmado, SHALL subirse a Odoo: imagen principal por color en las variantes de ese color, imagen del template y adicionales como `product.image`. Un error de imágenes no hace fallar la confirmación.

#### Scenario: Subir imagen a orden confirmada
- **WHEN** se sube una imagen temporal a una orden `CONFIRMED`
- **THEN** el sistema responde 409

### Requirement: PDF de la orden
El sistema SHALL generar un PDF en grilla color × talle por artículo, en dos modos: proveedor (suma las sucursales y muestra las columnas de impresión configurables) e interno (una subfila por sucursal). Incluye subtotales por artículo, total general, total de unidades y comentario opcional; orientación horizontal por defecto.

#### Scenario: Descargar PDF al confirmar
- **WHEN** el usuario abre el modal de confirmación
- **THEN** puede descargar el PDF de proveedor (con comentario y orientación) y el interno

### Requirement: Listado de órdenes locales
El sistema SHALL listar las órdenes locales de a 30, de la más nueva a la más vieja, filtrables por proveedor, estado y rango de fecha, con las acciones según estado: ver error (`ERROR`), editar (`DRAFT`/`ERROR`), confirmar (`DRAFT`), ver (`CONFIRMED`), duplicar (todas) y eliminar (`DRAFT`/`ERROR`).

#### Scenario: Duplicar una orden
- **WHEN** el usuario duplica una orden
- **THEN** se crea una orden nueva con proveedor, fecha, sucursales, columnas de impresión y artículos (con IDs nuevos y sin vínculos a líneas de Odoo), sin marca ni compradoras, y se abre en edición

### Requirement: Edición de artículos de una orden confirmada
En una orden `CONFIRMED` la cabecera SHALL quedar bloqueada y cada artículo SHALL poder editarse y sincronizarse a Odoo: costo, precio de venta, descripción, categoría, colores y talles nuevos, atributos, códigos de barra e imágenes. Las líneas de la orden de compra se actualizan si cambia cantidad o precio y se crean para variantes nuevas con cantidad; nunca se eliminan. No se cambian nombre ni referencia del template.

#### Scenario: Guardar artículo editado
- **WHEN** el usuario guarda un artículo de una orden confirmada
- **THEN** los cambios se escriben en Odoo y en la orden local; si Odoo falla, el sistema responde 502

### Requirement: Asistentes de IA
`ADMIN` y `MANAGER` SHALL poder generar la descripción web de un artículo (OpenRouter, tono según sucursal) y pedir sugerencias de color HEX para un color de proveedor (hasta 5).

#### Scenario: Encargado pide descripción IA
- **WHEN** un `EMPLEADO` llama a `/api/description`
- **THEN** el sistema responde 403

### Requirement: Historial de órdenes de Odoo
El sistema SHALL mostrar en `/odoo-orders`, solo lectura, las `purchase.order` de Odoo que no están canceladas ni terminadas, de a 30 por fecha descendente, filtrables por proveedor, estado (borrador, enviada, confirmada) y fecha.

#### Scenario: Consultar historial
- **WHEN** un `ADMIN`, `MANAGER` o `EMPLEADO` abre "Historial Odoo"
- **THEN** ve número, proveedor, estado, fecha y total de cada orden
