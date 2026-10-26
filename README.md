# Casa Sonia Compras

App interna de Casa Sonia integrada con Odoo 19: consulta de stock, promociones, órdenes de compra, conteos de inventario y gestión de empleados.

## Desarrollo

```bash
pnpm install
cp .env.example .env    # completar DATABASE_URL, JWT_SECRET, ODOO_*, OPENROUTER_*
pnpm db:migrate
pnpm dev                # http://localhost:3000
```

## Deploy

Push a `main` → GitHub Actions construye la imagen Docker y la levanta en el VPS (`.github/workflows/deploy.yml`, `docker-compose.vps.yml`).

## Documentación

- [`docs/README.md`](docs/README.md): índice.
- [`openspec/specs/`](openspec/specs): cómo funciona hoy cada módulo.
- [`docs/arquitectura.md`](docs/arquitectura.md): stack, permisos, integración con Odoo.
