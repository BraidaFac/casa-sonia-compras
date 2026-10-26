# existencias Specification

## Purpose
Consulta de stock en el salón: escanear o buscar un artículo y ver al instante su ficha, precios con descuentos y promociones vigentes, y stock por depósito, color y talle. Solo lectura contra Odoo. Implementación: `src/app/(app)/existencias/**`, `src/app/api/existencias/**`, `src/lib/odooExistencias.ts`, `src/components/existencias/**`, `src/app/api/search-history/**`.

## Requirements

### Requirement: Acceso
Todos los roles, incluido `EMPLEADO_BASICO`, SHALL acceder a Existencias. Es la pantalla de inicio después del login.

#### Scenario: Empleado básico consulta
- **WHEN** un `EMPLEADO_BASICO` inicia sesión
- **THEN** llega a `/existencias` y puede consultar

### Requirement: Búsqueda por código
Al pulsar Enter o pegar en el buscador, el sistema SHALL buscar una variante activa por `barcode` exacto y, si no hay, por `default_code` exacto, y abrir su ficha resaltando la variante.

#### Scenario: Código inexistente
- **WHEN** el código no existe
- **THEN** se muestra "Código no encontrado"

### Requirement: Búsqueda por texto
Con 2 o más caracteres, el sistema SHALL sugerir hasta 20 productos que coincidan por nombre, referencia o código de barra de alguna variante.

#### Scenario: Elegir sugerencia
- **WHEN** el usuario elige un producto sugerido
- **THEN** se abre su ficha

### Requirement: Búsqueda por filtros
El sistema SHALL permitir filtrar por categoría, talle (equivalencias), color (color base), marca, corte/modelo, calce/fit, material principal y diseño; AND entre grupos y OR dentro de cada grupo; resultados de a 24 en tarjetas con imagen. Los últimos 5 filtros usados se guardan en el navegador.

#### Scenario: Buscar sin filtros
- **WHEN** no hay ningún filtro seleccionado
- **THEN** el botón "Buscar" está deshabilitado

### Requirement: Ficha del artículo
La ficha SHALL mostrar foto (de la variante o del template), nombre, referencia, atributos descriptivos, "Precio tarjeta" (`list_price`), el precio por cada medio de pago con descuento vigente y una banda con las promociones bancarias vigentes hoy.

#### Scenario: Artículo sin foto
- **WHEN** ni la variante ni el template tienen imagen
- **THEN** se muestra "Sin foto"

### Requirement: Grilla de stock
El sistema SHALL mostrar, para el color seleccionado (por defecto el primero), una grilla depósito × talle con la suma de `stock.quant` en ubicaciones internas activas, consultada siempre en vivo. Talle sin variante muestra "–".

#### Scenario: Cambiar color
- **WHEN** el usuario elige otro color
- **THEN** la grilla muestra los talles y el stock de ese color

### Requirement: Historial de consultas por empleado
El sistema SHALL registrar cada producto consultado por empleado (sin duplicados, actualizando la fecha) y conservar los 20 más recientes; la pantalla vacía muestra los últimos 5 y un modal muestra los 20.

#### Scenario: Volver a un producto
- **WHEN** el usuario elige un producto del historial
- **THEN** se abre su ficha
