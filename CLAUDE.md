# CLAUDE.md

Guía para Claude Code en este repo.

## Reglas de trabajo

- **No commits automáticos.** Commitear solo cuando el usuario lo pida explícitamente.
- **Specs con OpenSpec.** Toda funcionalidad nueva o cambio de comportamiento arranca con `/opsx:propose`, se implementa con `/opsx:apply` y se cierra con `/opsx:archive` (que actualiza `openspec/specs/`). Artefactos en español.
- **El middleware es `src/proxy.ts`.** Next.js 16 usa `proxy.ts`; nunca crear `middleware.ts`.
- **Permisos en tres capas.** Toda sección o ruta nueva se protege en `src/proxy.ts`, en `withAuth(..., { roles })` y en `src/components/layout/Sidebar.tsx`. Actualizar la matriz de `docs/arquitectura.md`.
- **Odoo solo vía `src/lib/odoo.ts`** o las librerías `src/lib/odoo*.ts`.
- Los `CLAUDE.md` de subcarpetas los genera el plugin claude-mem y están en `.gitignore`; no son documentación.

## Proyecto

**Casa Sonia Compras**: app interna integrada con Odoo 19. Módulos: Existencias (consulta de stock), Promociones, Órdenes de compra, Inventario, Historial Odoo, Empleados y Configuración.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Comportamiento de cada módulo (fuente de verdad) | `openspec/specs/<módulo>/spec.md` |
| Cambios en curso | `openspec/changes/` |
| Arquitectura, matriz de permisos, Odoo, deuda conocida | `docs/arquitectura.md` |
| Producto y usuarios | `docs/producto.md` |
| Design system | `docs/diseno.md` |
| Borradores de features futuras | `docs/borradores/` |
| Specs y planes viejos (solo referencia) | `docs/historico/` |

## Comandos

```bash
pnpm dev          # servidor de desarrollo (localhost:3000)
pnpm build        # build de producción
pnpm lint         # ESLint
pnpm db:generate  # regenerar cliente Prisma tras cambiar el schema
pnpm db:migrate   # migraciones de MariaDB (dev)
pnpm db:studio    # Prisma Studio
npx @fission-ai/openspec validate --specs --strict   # validar specs
```

No hay framework de tests.

## Convenciones

- Alias `@/*` → `src/*`.
- Prisma: importar desde `prisma/generated/client`. Modelos nuevos en español con `creadoPorId`/`creadoEn`/`actualizadoEn`.
- React Query: un hook por entidad en `src/hooks/use*.ts`, claves en `src/lib/queryKeys.ts`.
- Rutas API envueltas en `withAuth` (`src/lib/withAuth.ts`); errores como `{ error: string }`.
- UI: Mantine 9 tema oscuro + ámbar, fuentes `--font-display` (Syne), `--font-sans` (DM Sans), `--font-mono` (DM Mono).
- Roles: `ADMIN`, `MANAGER`, `EMPLEADO` ("Encargado"), `EMPLEADO_BASICO` ("Empleado").
