import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { idDe, ROLES_TESORERIA } from "@/lib/tesoreriaApi";
import { descargarAdjuntoOdoo, esencia, mimeValido, registrosOperacion } from "@/lib/tesoreriaAdjuntos";

const ids = async (ctx: object) => {
  const id = await idDe(ctx);
  const { adjuntoId } = await (ctx as { params: Promise<{ adjuntoId: string }> }).params;
  const adj = parseInt(adjuntoId, 10);
  return id && !Number.isNaN(adj) ? { id, adj } : null;
};

// Solo PDF e imágenes se abren en línea; cualquier otro tipo (p. ej. subido en Odoo) se descarga
const archivo = (a: { nombre: string; mimetype: string; contenido: Uint8Array }) => {
  const enLinea = mimeValido(a.mimetype);
  return new NextResponse(new Uint8Array(a.contenido), {
    headers: {
      "Content-Type": enLinea ? esencia(a.mimetype) : "application/octet-stream",
      "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.nombre)}`,
      "X-Content-Type-Options": "nosniff",      "Cache-Control": "private, no-store",
    },
  });
};

// ?origen=odoo lee de Odoo (verifica que sea de un registro de la operación); si no, el pendiente de la app
export const GET = withAuth(async (req: NextRequest, _p, ctx) => {
  const x = await ids(ctx);
  if (!x) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  if (req.nextUrl.searchParams.get("origen") === "odoo") {
    try {
      const a = await descargarAdjuntoOdoo(await registrosOperacion(x.id), x.adj);
      return a ? archivo(a) : NextResponse.json({ error: "No encontrado" }, { status: 404 });
    } catch {
      return NextResponse.json({ error: "No se pudo leer el adjunto de Odoo" }, { status: 502 });
    }
  }
  const a = await prisma.tesoreriaAdjunto.findFirst({ where: { id: x.adj, operacionId: x.id } });
  return a ? archivo(a) : NextResponse.json({ error: "No encontrado" }, { status: 404 });
}, { roles: ROLES_TESORERIA });

// Solo se quitan los del borrador; los que ya están en Odoo se gestionan allá
export const DELETE = withAuth(async (_req: NextRequest, _p, ctx) => {
  const x = await ids(ctx);
  if (!x) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const r = await prisma.tesoreriaAdjunto.deleteMany({ where: { id: x.adj, operacionId: x.id, operacion: { estado: "BORRADOR" } } });
  if (!r.count) return NextResponse.json({ error: "Solo se quitan adjuntos de un borrador" }, { status: 409 });
  return NextResponse.json({ ok: true });
}, { roles: ROLES_TESORERIA });
