# inventario Specification

## Purpose
Contar mercadería de un depósito por categorías, escaneando códigos de barra, y aplicar el conteo como ajuste de inventario en Odoo. Implementación: `src/app/(app)/inventario/**`, `src/app/api/inventario/**`, `src/components/inventario/**`, `src/lib/inventoryConfirmationSummary.ts`, modelo `Inventory`.

## Requirements

### Requirement: Ciclo de vida del conteo
Cada conteo SHALL guardarse en la tabla `inventories` con estado `BORRADOR` o `CONFIRMADO`, con los artículos contados en un JSON propio. Un fallo al confirmar deja el conteo en `BORRADOR` y guarda `errorDetail`.

#### Scenario: Conteo confirmado
- **WHEN** un conteo se confirma con éxito
- **THEN** pasa a `CONFIRMADO` con un snapshot del resumen y `confirmedById`, y la UI lo muestra en solo lectura

### Requirement: Crear un conteo
El sistema SHALL crear un conteo con depósito, fechas de conteo y contable (por defecto hoy), nombre opcional y al menos una categoría, y abrirlo para empezar a escanear.

#### Scenario: Nuevo conteo
- **WHEN** el usuario completa depósito, fechas y categorías en "Nuevo inventario"
- **THEN** se crea en `BORRADOR` sin artículos y se abre su detalle con esas categorías

### Requirement: Precarga por categoría
Al abrir un conteo, el sistema SHALL precargar en memoria las variantes activas con código de barra de las categorías elegidas, con su stock en las ubicaciones internas del depósito. Mientras carga, el escaneo queda deshabilitado; si falla, se sigue consultando Odoo por cada código.

#### Scenario: Precarga fallida
- **WHEN** la precarga de categorías falla
- **THEN** se muestra un aviso y cada escaneo consulta Odoo directamente

### Requirement: Escaneo y búsqueda manual
Cada código escaneado SHALL sumar 1 a la variante si ya está en la lista o agregarla con cantidad 1 si existe en Odoo (por `barcode` exacto, con reintento flexible si tiene espacios). La búsqueda manual SHALL buscar variantes por nombre, código, referencia o talle (mínimo 2 caracteres, hasta 15 resultados). Los últimos 10 escaneos se muestran en un historial en memoria.

#### Scenario: Código inexistente
- **WHEN** se escanea un código que no existe en Odoo
- **THEN** se muestra "No encontrado · {código}" con sonido de error y no se agrega nada

### Requirement: Edición de cantidades y precios
En un conteo `BORRADOR` el usuario SHALL poder ajustar cantidades, quitar filas y editar precio de venta y costo de una variante; el cambio de precios se escribe en Odoo (`product.product`). El conteo se guarda manualmente con "Guardar" y se recuerda guardar tras 5 minutos con cambios.

#### Scenario: Guardar el conteo
- **WHEN** el usuario pulsa "Guardar"
- **THEN** los artículos y su cantidad quedan persistidos en el conteo

### Requirement: Resumen previo a confirmar
Antes de confirmar, el sistema SHALL mostrar un resumen por categoría: contado vs stock en Odoo, diferencia en unidades y en costo, con aviso si la diferencia supera 10 unidades.

#### Scenario: Ver resumen de un conteo confirmado
- **WHEN** se abre el resumen de un conteo `CONFIRMADO`
- **THEN** se muestra el snapshot guardado al confirmar

### Requirement: Confirmar el conteo en Odoo
Solo `ADMIN` y `MANAGER` SHALL confirmar. Al confirmar, el sistema escribe `inventory_quantity` en los `stock.quant` de la primera ubicación interna del depósito (creándolos si faltan) y ejecuta `action_apply_inventory`. Opcionalmente lleva a cero las variantes no contadas de las categorías incluidas (activo por defecto). Las categorías desmarcadas se descartan o pasan a un nuevo conteo `BORRADOR`.

#### Scenario: Confirmar con categorías excluidas
- **WHEN** se desmarcan categorías en el resumen y se elige crear un nuevo borrador
- **THEN** se aplica el conteo de las categorías incluidas y los artículos excluidos quedan en un conteo nuevo

#### Scenario: Encargado confirma
- **WHEN** un `EMPLEADO` intenta confirmar
- **THEN** el sistema responde 403

### Requirement: Listado de conteos
El sistema SHALL listar los conteos de a 30, del más nuevo al más viejo, con nombre, depósito, estado, cantidad de artículos, fecha de conteo y creador, y acciones de ver, confirmar (solo `BORRADOR` con artículos) y eliminar.

#### Scenario: Eliminar conteo
- **WHEN** el usuario confirma la eliminación de un conteo
- **THEN** el conteo se borra de la base local
