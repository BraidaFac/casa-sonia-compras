# Prompt para Claude Code — Nueva sección "Existencias"

## 0. Cómo usar este prompt

Este documento describe **qué** hay que construir, no **cómo** (no propone código).
Antes de escribir una sola línea, ejecutá la **Fase 0 de reconocimiento**. La calidad
de todo lo demás depende de que reutilices los patrones existentes de la app en lugar
de inventar nuevos. Si algo de este spec entra en conflicto con lo que encontrás en el
código, **frená y preguntá** en vez de asumir.

---

## 1. Contexto y objetivo

- La app ya tiene secciones **Inventario** y **Órdenes** (de compra). Vamos a crear una
  tercera sección hermana, al mismo nivel de navegación.
- **Nombre de trabajo:** "Existencias".
- **Objetivo funcional:** que un vendedor en el piso escanee un código de barras con
  pistola (o busque manualmente) y vea **al instante** el stock del artículo escaneado,
  desglosado por depósito, talle y color, junto con su ficha y precio de venta.
- **Fuente de verdad: Odoo.** La app ya tiene un servicio exclusivo para obtener data de
  Odoo. **Toda** la información de esta sección se recupera a través de ese servicio. No
  se persiste stock en la base local salvo lo estrictamente necesario para caché/historial
  (ver secciones 7 y 9).

---

## 2. FASE 0 — Reconocimiento obligatorio (antes de codear)

Leé y documentá (en un comentario o nota breve) lo siguiente. No avances hasta tener esto claro:

1. **Servicio de Odoo:** qué métodos expone hoy, qué modelos/campos de Odoo consulta,
   cómo maneja autenticación, timeouts y errores. Identificá si ya existe un método para
   traer stock por variante/ubicación o si hay que agregar uno nuevo.
2. **Sección Órdenes:** cómo recupera y muestra las **imágenes** del artículo desde Odoo
   (campos, endpoint, formato, caché). **Reutilizar esa misma lógica** para las fotos de
   esta sección.
3. **Sección Inventario:** cómo está implementado su **buscador manual** (contrato de
   entrada/salida, campos por los que busca, paginación). El objetivo es **reutilizarlo**;
   si no se puede reutilizar tal cual, extraerlo a un componente/servicio compartido.
4. **Sistema de roles y permisos:** cómo se definen los roles (enum, tabla en DB, config),
   dónde se hacen los checks (backend, guards de ruta, visibilidad de menú), y **muy
   importante:** si la jerarquía se evalúa por comparación numérica de nivel o por
   pertenencia explícita a un rol. Ver sección 8.
5. **Navegación:** cómo se registran las secciones en el menú/rutas para agregar la nueva
   de forma consistente.

Al terminar la Fase 0, listá los supuestos que quedaron sin confirmar y pedí confirmación.

---

## 3. Datos a recuperar desde Odoo

Para el artículo consultado (plantilla / `product.template`) y sus variantes
(`product.product`):

### 3.1 Ficha del artículo (mostrar en un panel de descripción)

- Marca
- Material Principal
- Composición
- Corte
- Género
- Ocasión
- Temporada
- Cuello

> **A confirmar en Fase 0:** si estos son atributos de Odoo, campos propios o custom
> fields. Mapear los nombres reales de campo. Si alguno no existe o viene vacío para un
> artículo, ocultar esa línea (no mostrar "—" ni romper el layout).

### 3.2 Precio de venta

- Mostrarlo de forma **prominente y siempre visible** (no escondido en la ficha).
- Confirmar de qué campo/lista de precios de Odoo sale y si depende de la variante o es
  a nivel plantilla.

### 3.3 Foto(s)

- Reutilizar la lógica de Órdenes.
- Definir si la foto es a nivel plantilla o por variante de color (en indumentaria suele
  variar por color). Si hay foto por color, la foto debe cambiar al cambiar el filtro de color.

### 3.4 Atributos que generan variante stockeable

- **Talle** → define las **columnas** de la grilla.
- **Color** → define los **filtros** (chips) de color.
- Ambos generan variantes stockeables; el stock se consulta a nivel variante
  (color + talle) por ubicación.

### 3.5 Stock por ubicación

- Depósitos/ubicaciones → **filas** de la grilla (en el wireframe: Ruta, Centro, Estribo, Quiver).
- **métrica de stock se muestra** cantidad a mano (`qty_available`)
- Las ubicaciones a mostrar deben venir de Odoo, no hardcodearse. Confirmar si se muestran
  todas las ubicaciones internas o un subconjunto configurable.

---

## 4. Diseño de la vista (basado en el wireframe)

Estilos: Mantener estilos generales de la app, ya tiene un estandar la app para las secciones, colores definidos, etc.

Layout general de arriba hacia abajo:

1. **Barra superior de acciones:** input de escaneo/búsqueda + ícono de historial (ver §7).
2. **Cabecera del artículo (cuando hay uno seleccionado):**
   - Foto del producto (izquierda, como en el wireframe).
   - Descripción/ficha (§3.1) + **Precio de venta** bien visible.
3. **Fila de filtros de Color:** chips con los colores disponibles **para ese artículo**
   (no todos los colores del sistema). El chip seleccionado queda resaltado (equivalente
   al relleno amarillo del wireframe sobre "VERDE"). Al cambiar de color, la grilla y la
   foto se actualizan.
4. **Grilla de stock:**
   - **Columnas = talles** (ej. 38, 40, 42, 44, 46), ordenados de forma coherente
     (numérico ascendente; contemplar talles alfabéticos S/M/L/XL con un orden definido —
     ver §9).
   - **Filas = depósitos/ubicaciones**.
   - **Celda = cantidad de stock** de esa combinación (color filtrado × talle × depósito).
   - **Importante:** los `1` y `0` del wireframe son ilustrativos. Las celdas muestran la
     **cantidad real**. Hay que distinguir visualmente tres estados: (a) variante válida
     con stock > 0, (b) variante válida con stock 0, (c) combinación que **no existe como
     variante** (celda vacía / deshabilitada, no confundir con 0).

### 4.1 Estado vacío (sin artículo seleccionado)

- Mostrar los **últimos 5 artículos buscados** como accesos rápidos (tarjetas/lista).
  Tocar uno lo selecciona y carga su grilla.
- Si no hay historial todavía, mostrar un estado vacío claro que invite a escanear/buscar.

---

## 5. Escaneo con pistola

- El scanner físico se comporta como teclado: emite los caracteres del código y termina
  con Enter. El input de escaneo debe capturar eso de forma robusta.
- Al escanear un código válido:
  - Resolver el código de barras contra Odoo → normalmente apunta a una **variante
    específica** (color + talle).
  - Seleccionar la **plantilla** de ese artículo, **auto-seleccionar el filtro de color**
    de la variante escaneada y, si aplica, **resaltar la celda** (talle × depósito) de la
    variante escaneada dentro de la grilla.
  - Registrar el evento en el historial (§7).
- Manejar el foco: tras cargar un resultado, el input debe quedar listo para el siguiente
  escaneo sin requerir clic manual (flujo de piso, escaneos consecutivos).

---

## 6. Búsqueda manual

- **Reutilizar el buscador de Inventario** (flexible/completo). Si no se puede reutilizar
  directo, extraerlo a un componente compartido para no duplicar lógica.
- Debe permitir buscar por los mismos criterios que Inventario (confirmar en Fase 0:
  nombre, código, referencia, código de barras, etc.).
- Si la búsqueda devuelve **varios** resultados, mostrar una lista para que el usuario elija;
  al elegir uno, se carga la grilla y se registra en el historial.
- Si devuelve **un solo** resultado, se puede cargar directo.

---

## 7. Historial de búsquedas

- Guardar las **últimas 20** consultas (escaneos + búsquedas que resultaron en selección).
- Ícono en la barra superior que abre un **modal** con esas 20 entradas.
- Tocar una entrada del modal **selecciona** ese artículo y muestra su stock.
- Los **últimos 5** del estado vacío (§4.1) son el subconjunto más reciente de estas 20.

**Decisiones a definir explícitamente (documentarlas):**

- **Dónde se persiste:** ¿local al dispositivo o por usuario en backend? Si un vendedor usa
  varias terminales, el historial por usuario en backend es más útil; el local es más simple.
  Elegir y justificar. Evitar guardar el stock (dato volátil): guardar identificador del
  artículo + metadatos mínimos para re-renderizar la entrada, y **re-consultar el stock a
  Odoo** al seleccionarla (el stock pudo cambiar).
- **Deduplicación:** si se consulta el mismo artículo dos veces, ¿sube al tope y no duplica,
  o se listan repeticiones? Recomendado: deduplicar por artículo y ordenar por más reciente.
- **Qué cuenta como "búsqueda":** una selección efectiva de artículo (no cada tecla ni cada
  búsqueda sin resultado).

---

## 8. Roles y seguridad (zona de alto riesgo — leer con cuidado)

### 8.1 Estado actual

Tres roles: **Admin → Manager → Empleado**.

### 8.2 Objetivo

Cuatro roles: **Admin → Manager → Encargado → Empleado**, donde:

- El rol que hoy se llama "Empleado" pasa a llamarse **"Encargado"** y **conserva
  exactamente los permisos que tiene hoy**.
- Se crea un rol **"Empleado" nuevo**, más restringido: **solo** puede ver la sección
  Consulta de Stock. **Nada más** (ni Inventario, ni Órdenes, ni configuración, ni nada).
- Admin y Manager quedan **igual** que hoy.

### 8.3 Enfoque recomendado (para no romper nada)

**No renombrar el identificador interno del rol existente.** Solo cambiar su **etiqueta
visible** a "Encargado". Motivo: si el identificador cambia, hay que migrar en simultáneo
todos los usuarios y todos los checks de permiso; cualquier referencia que quede al valor
viejo genera un agujero o deja gente sin acceso.

Entonces:

- Rol existente: **mismo identificador interno**, nueva etiqueta visible "Encargado",
  permisos intactos.
- Rol nuevo: **identificador nuevo**, etiqueta visible "Empleado", permiso único = ver
  Consulta de Stock.

> Si en el código actual el identificador y la etiqueta son **el mismo string** (ej. el rol
> se identifica literalmente por "Empleado"), hay colisión: el nuevo rol quiere mostrarse
> como "Empleado". En ese caso, primero **separá identificador de etiqueta** (o migrá el
> identificador viejo a uno neutro) antes de crear el rol nuevo. Confirmar esto en Fase 0.

### 8.4 Checks obligatorios (verificar TODOS)

- **Jerarquía numérica:** si en algún lado se compara el rol por nivel (`rol >= X`),
  insertar "Encargado" entre Manager y Empleado **corre los niveles**. Revisar y ajustar
  todas esas comparaciones para que sigan significando lo mismo.
- **Autorización en backend:** el nuevo "Empleado" debe quedar bloqueado a nivel API/servidor
  para todo lo que no sea Consulta de Stock. **No alcanza con ocultar el menú en el front.**
- **Menú / navegación:** el nuevo "Empleado" solo ve la entrada de Consulta de Stock.
- **Landing / ruta por defecto:** definir a dónde entra el nuevo "Empleado" al iniciar sesión,
  ya que no puede acceder al dashboard/rutas habituales. Debe aterrizar en Consulta de Stock,
  y cualquier intento de navegar a otra ruta debe redirigir/bloquear con un mensaje claro.
- **Claims de sesión/token:** si el rol viaja en el token/sesión, asegurar coherencia tras
  el cambio.
- **Acceso a la sección para todos:** confirmar que Admin, Manager y Encargado también
  pueden ver Consulta de Stock (la sección es accesible por cualquier empleado).

### 8.5 Migración de datos

- Los usuarios que **hoy** tienen el rol "Empleado" deben quedar como **"Encargado"**
  (conservan acceso). Con el enfoque recomendado (mismo identificador, etiqueta nueva),
  esto puede no requerir migración de datos; **verificarlo**.
- El nuevo rol "Empleado" arranca **sin usuarios** (o con los que se asignen explícitamente).
- Si el proyecto tiene **tests** o **seeds/fixtures** que referencian roles, actualizarlos.

---

## 9. Casos borde a contemplar (no dejar ninguno sin resolver)

**Datos / variantes**

- Artículo **sin** atributo Color y/o **sin** atributo Talle (no todos los productos tienen
  ambos): la grilla debe degradar con gracia (ej. sin fila de filtros de color, o una sola
  columna). Definir el comportamiento.
- Combinación color×talle que **no existe como variante** → celda deshabilitada, distinta de 0.
- **Stock negativo** en Odoo (posible): decidir si se muestra tal cual o se trata como 0
  (recomendado: mostrar el valor real, es información).
- Talles **alfabéticos** (S, M, L, XL, XXL) o mixtos: definir orden explícito, no confiar en
  orden alfabético crudo.
- **Muchos** talles (más columnas de las que entran) → scroll horizontal / diseño responsive.
- **Muchos** depósitos → scroll vertical.
- Artículo **sin foto** → placeholder, sin romper layout.
- Campos de ficha (§3.1) vacíos → ocultar la línea correspondiente.
- Precio de venta ausente o por variante → definir fallback.

**Escaneo / búsqueda**

- Código escaneado **no encontrado** en Odoo → mensaje claro, no romper, foco listo para
  reintentar.
- Código que mapea a un producto **sin** variantes stockeables → mostrar ficha con aviso de
  que no hay grilla de stock.
- Escaneo mientras ya hay un artículo cargado → reemplaza el actual.
- Escaneo con input malformado / caracteres raros → ignorar con feedback, no crashear.
- Búsqueda manual **sin resultados** → estado claro.
- Búsqueda con **muchos** resultados → lista paginada/limitada.

**Odoo / red / rendimiento**

- **Latencia:** el vendedor espera "al instante". Definir estados de carga (skeleton/spinner)
  y, si aplica, caché de corta duración para ficha/foto (el stock conviene siempre fresco).
- **Timeout / caída de Odoo** → mensaje de error accionable, opción de reintento, sin dejar
  la UI colgada.
- **Escaneos consecutivos rápidos** → evitar condiciones de carrera (que el resultado de un
  escaneo viejo pise al nuevo); cancelar/ignorar respuestas obsoletas.

**Historial**

- Historial vacío (primera vez) → estado vacío en modal y en la vista principal.
- Artículo del historial que **ya no existe** en Odoo → manejar el error al re-seleccionarlo.
- Mismo artículo consultado varias veces → deduplicar (§7).

**Roles**

- Ver todos los checks de §8.4 y §8.5.

---

## 10. Criterios de aceptación

- Un usuario con rol "Empleado" (nuevo) inicia sesión, **solo** ve Consulta de Stock, y
  **no puede** acceder a ninguna otra sección ni por menú ni por URL directa ni por API.
- Un usuario que antes era "Empleado" ahora figura como "Encargado" con **los mismos
  permisos de antes**.
- Escanear un código de barras válido carga, en menos de lo que se sienta "instantáneo",
  la foto, ficha, precio de venta y la grilla stock (depósitos × talles) con el color de la
  variante escaneada pre-seleccionado.
- Cambiar el filtro de color actualiza grilla (y foto si corresponde) sin recargar todo.
- Las celdas distinguen visualmente stock>0, stock=0 y variante inexistente.
- El buscador manual reutiliza (o comparte) la lógica del de Inventario.
- El ícono de historial abre un modal con las últimas 20 consultas; tocar una selecciona el
  artículo. La vista vacía muestra las últimas 5.
- Ninguna comparación de jerarquía de roles quedó rota por la inserción de "Encargado".

---

## 11. Preguntas abiertas para confirmar antes de cerrar el diseño

1. ¿La foto es por plantilla o por variante de color?
2. ¿El historial se persiste local al dispositivo o por usuario en backend?
3. ¿El identificador del rol actual "Empleado" está separado de su etiqueta, o son el mismo
   string? (define la estrategia de §8.3)
4. ¿Qué ubicaciones/depósitos de Odoo se muestran: todas las internas o un subconjunto?
