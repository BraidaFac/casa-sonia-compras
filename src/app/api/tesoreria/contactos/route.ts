import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { ROLES_TESORERIA } from "@/lib/tesoreriaApi";
import { buscarContactos, contactoPorCuit, ot, tipoIdentificacionCuit } from "@/lib/odooTesoreria";
import { cuitValido } from "@/lib/tesoreria";

export const GET = withAuth(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const cuit = req.nextUrl.searchParams.get("cuit");
  if (cuit) return NextResponse.json({ existente: await contactoPorCuit(cuit.replace(/\D/g, "")) });
  return NextResponse.json(await buscarContactos(q));
}, { roles: ROLES_TESORERIA });

// Alta rápida de contacto en Odoo (R40)
export const POST = withAuth(async (req: NextRequest) => {
  const b = await req.json().catch(() => null);
  const nombre = typeof b?.nombre === "string" ? b.nombre.trim() : "";
  const cuit = typeof b?.cuit === "string" ? b.cuit.replace(/\D/g, "") : "";
  const responsabilidadId = typeof b?.responsabilidadId === "number" ? b.responsabilidadId : null;
  const cliente = !!b?.cliente;
  const proveedor = !!b?.proveedor;
  if (!nombre) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  if (!cuitValido(cuit)) return NextResponse.json({ error: "El CUIT no es válido" }, { status: 400 });
  if (!responsabilidadId) return NextResponse.json({ error: "Falta la condición frente al IVA" }, { status: 400 });
  if (!cliente && !proveedor) return NextResponse.json({ error: "Elegí cliente, proveedor o ambos" }, { status: 400 });

  const existente = await contactoPorCuit(cuit);
  if (existente) return NextResponse.json({ error: "Ya existe un contacto con ese CUIT", existente }, { status: 409 });

  const res = await ot<number[] | number>("res.partner", "create", {
    vals_list: [{
      name: nombre,
      vat: cuit,
      is_company: true,
      l10n_latam_identification_type_id: await tipoIdentificacionCuit(),
      l10n_ar_afip_responsibility_type_id: responsabilidadId,
      customer_rank: cliente ? 1 : 0,
      supplier_rank: proveedor ? 1 : 0,
    }],
  });
  const id = Array.isArray(res) ? res[0] : res;
  return NextResponse.json({ id, nombre, cuit }, { status: 201 });
}, { roles: ROLES_TESORERIA });
