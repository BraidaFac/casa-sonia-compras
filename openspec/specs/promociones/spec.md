# promociones Specification

## Purpose
Configurar medios de pago, bancos, descuentos especiales y promociones bancarias, mostrar las vigentes y generar una pieza imprimible. Los precios resultantes se muestran en Existencias y nunca se escriben en Odoo. Implementación: `src/app/(app)/configuracion/**`, `src/app/(app)/promociones-vigentes/**`, `src/app/api/config/**`, `src/app/api/pdf-promociones/**`, `src/lib/configPricing.ts`, `src/lib/vigentesHelpers.ts`, `src/lib/htmlPromociones.ts`.

## Requirements

### Requirement: Configuración restringida
Solo `ADMIN` y `MANAGER` SHALL acceder a `/configuracion` y a sus APIs de alta, edición, activación y borrado.

#### Scenario: Otro rol entra a configuración
- **WHEN** un `EMPLEADO` abre `/configuracion`
- **THEN** es redirigido y las APIs de configuración le responden 403

### Requirement: Medios de pago y bancos
El sistema SHALL administrar medios de pago y bancos con nombre único, estado activo y, en bancos, un ícono del catálogo `bankIcons`. El borrado es físico y se rechaza con 409 si el medio tiene descuentos o el banco tiene promociones.

#### Scenario: Nombre repetido
- **WHEN** se crea o renombra un medio de pago o banco con un nombre existente
- **THEN** el sistema responde 409

### Requirement: Descuentos especiales
El sistema SHALL administrar descuentos por medio de pago, de tipo porcentaje o monto fijo, con alcance global o por categoría de Odoo y vigencia opcional. Solo puede haber un descuento activo por medio de pago, alcance y categoría.

#### Scenario: Descuento activo duplicado
- **WHEN** se activa un segundo descuento para el mismo medio, alcance y categoría
- **THEN** el sistema responde 409

#### Scenario: Precio con descuento
- **WHEN** se muestra un artículo en Existencias
- **THEN** por cada medio de pago se aplica el descuento de la categoría más específica de la cadena de ancestros o, si no hay, el global, redondeando a la decena y sin bajar de 0

### Requirement: Promociones bancarias
El sistema SHALL administrar promociones con uno o más bancos, marca de tarjeta opcional, tipo de beneficio (cuotas sin interés, cuotas con interés, reintegro, descuento directo, cuotas con descuento, cuotas con reintegro), cuotas, coeficiente, porcentaje, tope, días aplicables, vigencia y orden.

#### Scenario: Promoción de cuotas sin cantidad
- **WHEN** se crea una promoción de cuotas sin cantidad de cuotas
- **THEN** el sistema responde 400

### Requirement: Promociones vigentes
El sistema SHALL calcular la vigencia en hora de Buenos Aires y agrupar las promociones activas en: vigentes hoy (dentro de fechas y aplicable al día), otros días (dentro de fechas pero no hoy) y próximas (empiezan después de hoy). La pantalla `/promociones-vigentes` es accesible para todos los roles.

#### Scenario: Promoción solo los martes
- **WHEN** hoy es lunes y una promoción vigente aplica solo los martes
- **THEN** aparece en el grupo de otros días y no en la banda de Existencias

### Requirement: Pieza imprimible de promociones
Desde Promociones vigentes, el usuario SHALL elegir y ordenar promociones y descuentos y generar una página HTML imprimible que se abre en una pestaña nueva.

#### Scenario: Generar sin ítems
- **WHEN** se pide generar sin elegir ítems
- **THEN** el sistema responde 400
