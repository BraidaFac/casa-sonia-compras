# Arquitectura — estado actual

Foto de cómo está construida la app hoy. El comportamiento funcional de cada módulo está en `openspec/specs/<módulo>/spec.md`; acá va el *cómo* transversal. Relevado el 2026-10-26.

## Stack

- Next.js 16 (App Router) + React 19, TypeScript.
- Mantine 9 (tema oscuro, primario ámbar) + Tailwind CSS 4. Design system en [`diseno.md`](diseno.md).
- TanStack React Query 5 para estado de servidor.
- Prisma 7 + MariaDB (`@prisma/adapter-mariadb`). Cliente generado en `prisma/generated/client` (importar desde ahí, no desde `@prisma/client`).
- Odoo 19 vía API JSON-2.
- Sin framework de tests.
- Deploy: push a `main` → GitHub Actions (`.github/workflows/deploy.yml`) construye imagen Docker, la sube y la levanta por SSH en el VPS (`docker-compose.vps.yml`).

## Estructura

```
src/
  proxy.ts                 middleware (auth + guards por rol). NO crear middleware.ts
  app/(auth)/login/        login (público)
  app/(app)/               secciones con sidebar
    existencias/           consulta de stock (inicio post-login)
    promociones-vigentes/
    orders/  orders/new  orders/[id]/edit
    inventario/  inventario/[id]
    odoo-orders/           historial de purchase.order (solo lectura)
    empleados/  configuracion/
  app/api/                 route handlers, todos envueltos en withAuth
  components/<módulo>/     UI por módulo; layout/Sidebar.tsx = menú
  hooks/use*.ts            un hook React Query por entidad; claves en lib/queryKeys.ts
  lib/                     lógica de servidor y helpers (ver abajo)
  types/index.ts           interfaces compartidas (Article, Row, etc.)
prisma/schema.prisma       modelos locales
openspec/                  specs vivas y cambios propuestos
docs/                      esta documentación
```

## Autenticación y permisos

- Login contra `employees` (bcrypt) → JWT HS256 de 365 días en cookie httpOnly `auth_token` con `employeeId`, `username`, `name`, `role`.
- `src/proxy.ts`: exige token en todo salvo `/login`, `/api/auth/*` y estáticos; aplica bloqueos por prefijo para `EMPLEADO_BASICO` y `TESORERO` (allowlist), `MANAGER` (bloquea Tesorería) y `EMPLEADO` (bloquea `/empleados` y Tesorería).
- API: `withAuth(handler, { roles })` (`src/lib/withAuth.ts`) → 401 sin sesión, 403 si el rol no está. `requireRole` en `lib/auth.ts` existe pero no se usa.
- Menú: filtros en `src/components/layout/Sidebar.tsx`.
- **Agregar una sección nueva implica tocar las tres capas**: proxy (si algún rol no debe entrar), `withAuth` en cada ruta y el Sidebar.

### Matriz de permisos

A = ADMIN, M = MANAGER, E = EMPLEADO ("Encargado"), B = EMPLEADO_BASICO ("Empleado"), T = TESORERO ("Tesorero"). "Todos" = cualquier autenticado salvo T: el proxy deja a T solo en `/tesoreria/**`, `/api/tesoreria/**` y `/api/auth/*`.

**Páginas**

| Página | A | M | E | B | T |
|---|---|---|---|---|---|
| /existencias, /promociones-vigentes | ✓ | ✓ | ✓ | ✓ | — |
| /orders/**, /inventario/**, /odoo-orders | ✓ | ✓ | ✓ | — | — |
| /empleados, /configuracion | ✓ | ✓ | — | — | — |
| /tesoreria | ✓ | — | — | — | ✓ |
| /tesoreria/extracto | ✓ | — | — | — | ✓ |
| /tesoreria/resumen | ✓ | — | — | — | ✓ |
| /configuracion → pestaña Tesorería | ✓ | — | — | — | — |

**API**

| Ruta | Métodos | Roles |
|---|---|---|
| /api/auth/login, /logout | POST | Público |
| /api/auth/me | GET | Todos |
| /api/existencias/* (search, barcode, product, stock, filter) | GET | Todos |
| /api/search-history | GET, POST | Todos |
| /api/config/vigentes, /api/config/categorias | GET | Todos |
| /api/pdf-promociones/preview | POST | Todos menos B (proxy) |
| /api/brands, categories, suppliers, warehouses, compradora, attributes/**, size-attributes, color-base-options, product-types | GET | Todos menos B (proxy) |
| /api/local-orders | GET, POST | Todos menos B (proxy) |
| /api/local-orders/[id] (+ articles, confirm, duplicate, images) | todos | A, M, E |
| /api/orders, /api/orders/[id], /api/orders/[id]/pdf, /api/pdf | GET/POST | A, M, E |
| /api/products/** | GET/POST | A, M, E |
| /api/inventario/** | todos | A, M, E |
| /api/inventario/[id]/confirm | POST | A, M |
| /api/description, /api/suggest-hex | POST | A, M |
| /api/employees/** | todos | A, M |
| /api/config/{medios-pago,bancos,descuentos,promociones}/** | todos | A, M |
| /api/cache/clear | POST | A |
| /api/tesoreria/** | todos | A, T |
| /api/tesoreria/config | PUT | A |

## Integración con Odoo

- Todo pasa por `src/lib/odoo.ts`: `search`, `read`, `searchRead`, `fetchAll` (paginado de a 100), `create`, `write`, `unlink`, `call`. Bearer `ODOO_API_KEY`, contexto `lang: es_AR`. `addErrorContext`/`articleLabel` agregan contexto de artículo a los errores.
- Librerías por dominio:
  - `odooProducts.ts`: buscar/crear templates, colores, supplierinfo, pricelist, variantes, imágenes.
  - `odooOrderCreation.ts`: confirmación completa de una orden, con rollback parcial.
  - `odooArticleUpdate.ts`: edición de artículos de órdenes confirmadas.
  - `odooExistencias.ts`: lookups de Existencias (ubicaciones internas cacheadas 12 h en memoria).
  - `productCache.ts`: metadatos de atributos (Color, Marca, Tipo, Talle) cacheados 4,5 h en memoria; `POST /api/cache/clear` los limpia.
- Campos custom de Odoo Studio en uso: `x_studio_sucursal`, `x_studio_compradores2_1` (purchase.order), `x_studio_color_base`, `x_studio_equivalencias` (product.attribute.value).
- Odoo es la fuente de verdad de productos, stock y órdenes confirmadas. La base local guarda borradores, empleados, historial de búsquedas, conteos y configuración comercial.

## Base de datos local

| Modelo | Uso |
|---|---|
| `Employee` | usuarios y roles |
| `Order` | órdenes de compra locales (DRAFT/CONFIRMED/ERROR), artículos en JSON |
| `Inventory` | conteos (BORRADOR/CONFIRMADO), artículos en JSON |
| `SearchHistory` | últimos 20 productos consultados por empleado |
| `MedioPago`, `Banco`, `DescuentoEspecial`, `PromocionBancaria` | configuración comercial |

Convención para modelos nuevos: nombres en español, `creadoPorId` / `creadoEn` / `actualizadoEn`, `@@map` a snake_case.

## Servicios externos (variables de entorno)

Ver `.env.example`. `DATABASE_URL`, `JWT_SECRET`, `ODOO_URL`/`ODOO_DB`/`ODOO_API_KEY`, `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` (descripciones y HEX con IA), `DEFAULT_PRICE_COEFICIENTE` y `NEXT_PUBLIC_DEFAULT_PRICE_COEFICIENTE` (coeficiente costo→venta, 2.2). Las variables `GOOGLE_*` están declaradas pero **la sincronización con Google Drive no está implementada** (`api/drive-image` y `api/upload-image` son carpetas vacías).

## Deuda conocida

Hallazgos del relevamiento del 2026-10-26. No son comportamiento deseado; están acá para decidir si se corrigen.

**Auth y permisos**
- Un empleado desactivado sigue operando con su token hasta que vence (365 días): el JWT no se revalida contra la DB.
- `EMPLEADO` entra a `/configuracion` (el proxy no lo bloquea; la página redirige en cliente y la API responde 403).
- El login ignora `?from=` y siempre va a `/existencias`.
- `PUT /api/employees/[id]` permite cambiarse el propio rol; no hay protección de "último ADMIN".
- Sin validación de largo de contraseña, formato de usuario ni valor de rol; login sin rate limit.

**Órdenes**
- La UI solo deja "Enviar a Odoo" a ADMIN/MANAGER, pero la API de confirmación acepta EMPLEADO.
- `PUT /api/local-orders/[id]` no bloquea órdenes `CONFIRMED`: puede sobrescribir cabecera y artículos en la DB local.
- Duplicar no copia marca ni compradoras.
- Confirmación sin lock: el doble envío solo se evita en el cliente.
- Si falla algo después de crear la purchase.order (p. ej. el update local), la PO queda en Odoo y la orden local en `ERROR`.
- Código sin uso: `watermarkPDF` (`lib/pdf.ts`), `GET /api/orders/[id]`, `lib/required-attrs.ts`. `console.log` de debug en `odooOrderCreation.ts`.

**Inventario**
- Confirmar desde el detalle con cambios sin guardar aplica lo que está en la DB, no lo que se ve en pantalla.
- `PATCH` y `DELETE /api/inventario/[id]` no validan estado (se puede modificar o borrar un conteo confirmado); el botón Eliminar aparece en todas las filas.
- `errorDetail` se guarda pero no se muestra.
- "Llevar a cero no contados" usa un criterio distinto al del resumen (sin filtrar activos ni con código de barra).
- El botón Confirmar del listado se muestra a todos los roles (el server responde 403).
- El guardado de precios desde inventario no chequea errores.
- Sin uso: `api/inventario/category-products` y `useCategoryProducts`.

**Promociones**
- Un banco inactivo sigue apareciendo en promociones; un medio de pago inactivo no oculta sus descuentos.
- Sin validación de rango de `valor` en descuentos; el PATCH no valida categoría al pasar a alcance por categoría.
- La UI no tiene etiqueta para `cuotas_con_descuento` ni `cuotas_con_reintegro`.
- Fechas de vigencia comparadas en UTC con "hoy" de Buenos Aires: posible desfase de un día.
