import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { ROLES_TESORERIA } from "@/lib/tesoreriaApi";
import { cargarConfig } from "@/lib/tesoreriaConfig";
import { bancos, diariosOdoo, OdooTesoreriaError, responsabilidadesIva, tiposComprobanteCompra } from "@/lib/odooTesoreria";

// Catálogos para cargar operaciones: diarios habilitados (y vigentes en Odoo), cuentas, bancos, condición frente al IVA.
export const GET = withAuth(async () => {
  const cfg = await cargarConfig();
  try {
    const [vigentes, bs, resp, tipos] = await Promise.all([diariosOdoo(), bancos(), responsabilidadesIva(), tiposComprobanteCompra()]);
    const ok = new Set(vigentes.map((d) => d.id));
    return NextResponse.json({ ...cfg, diarios: cfg.diarios.filter((d) => ok.has(d.odooJournalId)), bancos: bs, responsabilidades: resp, tiposComprobante: tipos, odooDisponible: true });
  } catch (e) {
    if (!(e instanceof OdooTesoreriaError && e.ambiguo)) throw e;
    return NextResponse.json({ ...cfg, bancos: [], responsabilidades: [], tiposComprobante: [], odooDisponible: false });
  }
}, { roles: ROLES_TESORERIA });
