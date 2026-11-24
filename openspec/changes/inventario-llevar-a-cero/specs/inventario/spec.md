# Spec Delta

## MODIFIED Requirements

### Requirement: Crear un conteo
El sistema SHALL crear un conteo con depósito, fechas de conteo y contable (por defecto hoy), nombre opcional, al menos una categoría y la opción "Llevar a cero no contados" (apagada por defecto, con una explicación visible de su alcance), y abrirlo para empezar a escanear. La opción elegida se guarda en el borrador.

#### Scenario: Nuevo conteo
- **WHEN** el usuario completa depósito, fechas y categorías en "Nuevo inventario"
- **THEN** se crea en `BORRADOR` sin artículos y se abre su detalle con esas categorías

#### Scenario: Alta sin tocar la opción
- **WHEN** el usuario crea un conteo sin cambiar "Llevar a cero no contados"
- **THEN** el borrador queda con la opción apagada

#### Scenario: Alta con la opción activada
- **WHEN** el usuario activa "Llevar a cero no contados" en "Nuevo inventario"
- **THEN** el borrador queda con la opción activada y el Resumen la muestra activada al abrirlo

### Requirement: Resumen previo a confirmar
Antes de confirmar, el sistema SHALL mostrar un resumen por categoría: contado vs stock en Odoo, diferencia en unidades y en costo, con aviso si la diferencia supera 10 unidades. Las categorías SHALL agruparse en un árbol de hasta 3 niveles según su ruta en Odoo, tanto en borradores como en confirmados; la selección para incluir o excluir sigue siendo por categoría.

#### Scenario: Ver resumen de un conteo confirmado
- **WHEN** se abre el resumen de un conteo `CONFIRMADO`
- **THEN** se muestra el snapshot guardado al confirmar

#### Scenario: Conteo con categorías de hombre y de mujer
- **WHEN** un conteo tiene artículos de "Hombres / Remeras / Remeras MC" y de "Mujer / Parte Superior / Remeras MC"
- **THEN** el resumen las muestra en ramas separadas del árbol ("Hombres › Remeras › Remeras MC" y "Mujer › Parte Superior › Remeras MC")

#### Scenario: Categoría con menos de 3 niveles
- **WHEN** una categoría tiene una ruta de 1 o 2 niveles
- **THEN** se muestra en el árbol con los niveles que tiene

### Requirement: Confirmar el conteo en Odoo
Solo `ADMIN` y `MANAGER` SHALL confirmar. Al confirmar, el sistema escribe `inventory_quantity` en los `stock.quant` de la primera ubicación interna del depósito (creándolos si faltan) y ejecuta `action_apply_inventory`. Opcionalmente lleva a cero las variantes no contadas de las categorías incluidas (apagado por defecto) y guarda en el conteo el valor usado. Las categorías desmarcadas se descartan o pasan a un nuevo conteo `BORRADOR`.

#### Scenario: Confirmar con categorías excluidas
- **WHEN** se desmarcan categorías en el resumen y se elige crear un nuevo borrador
- **THEN** se aplica el conteo de las categorías incluidas y los artículos excluidos quedan en un conteo nuevo

#### Scenario: Encargado confirma
- **WHEN** un `EMPLEADO` intenta confirmar
- **THEN** el sistema responde 403

#### Scenario: Confirmar sin indicar la opción
- **WHEN** llega una confirmación que no indica si llevar a cero los no contados
- **THEN** el sistema no lleva a cero ninguna variante no contada y guarda "No" como valor usado

#### Scenario: Confirmar llevando a cero
- **WHEN** se confirma con la opción activa
- **THEN** las variantes no contadas con stock de las categorías incluidas quedan en 0 en Odoo y el conteo guarda "Sí" como valor usado

## ADDED Requirements

### Requirement: Opción "Llevar a cero no contados" en el resumen
El resumen SHALL mostrar de forma destacada la opción "Llevar a cero no contados" con el valor del borrador, permitir cambiarla en un borrador y explicar su alcance. Si está activa, SHALL informar cuántas variantes con stock pasan a 0 por categoría, con la ruta completa de cada una.

#### Scenario: Impacto de llevar a cero
- **WHEN** la opción está activa en el resumen de un borrador y una categoría incluida tiene variantes con stock que no fueron contadas
- **THEN** el resumen indica, para esa categoría identificada por su ruta completa, cuántas variantes y unidades pasan a 0

#### Scenario: Cambiar la opción al confirmar
- **WHEN** el usuario cambia la opción en el resumen y confirma
- **THEN** se confirma con el valor elegido en el resumen y ese valor queda guardado en el borrador aunque la confirmación falle

#### Scenario: Valor usado en un conteo confirmado
- **WHEN** se abre el detalle o el resumen de un conteo `CONFIRMADO`
- **THEN** se muestra si se confirmó llevando a cero los no contados ("Sí" / "No"), o "Sin registro" si se confirmó antes de que se guardara ese dato

### Requirement: Advertencias antes de confirmar
Al pulsar confirmar, el sistema SHALL mostrar un diálogo de advertencias si alguna categoría incluida tiene una diferencia neta mayor a 10 unidades o alguna variante tiene una diferencia mayor al 10% de su stock en Odoo. Las advertencias SHALL ser no bloqueantes: el usuario puede volver al resumen o confirmar igual.

#### Scenario: Categoría con diferencia neta mayor a 10
- **WHEN** una categoría incluida suma una diferencia neta de más de 10 unidades (sobrantes y faltantes se compensan; incluye lo que se lleva a cero si la opción está activa)
- **THEN** el diálogo lista esa categoría con su ruta completa y su diferencia

#### Scenario: Variante con diferencia mayor al 10%
- **WHEN** una variante con stock en Odoo mayor a 0 queda con una diferencia mayor al 10% de ese stock
- **THEN** el diálogo lista la variante con su stock, lo contado y la diferencia

#### Scenario: No contadas llevadas a cero
- **WHEN** la opción "Llevar a cero no contados" está activa y una variante no contada de una categoría incluida tiene stock
- **THEN** esa variante figura en la lista de diferencias mayores al 10%

#### Scenario: Variante sin stock en Odoo
- **WHEN** una variante tiene stock 0 en Odoo y se contaron unidades
- **THEN** no genera advertencia del 10%

#### Scenario: Sin advertencias
- **WHEN** ninguna categoría ni variante supera los umbrales
- **THEN** la confirmación sigue sin mostrar el diálogo

#### Scenario: Confirmar igual
- **WHEN** el usuario elige "Confirmar igual" en el diálogo
- **THEN** la confirmación continúa como si no hubiera advertencias

#### Scenario: Volver al resumen
- **WHEN** el usuario elige "Volver" en el diálogo
- **THEN** no se confirma nada y el resumen queda abierto sin cambios
