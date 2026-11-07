import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { armarExtracto, DiarioInvalido } from "@/lib/tesoreriaExtracto";
import { hoyAR } from "@/lib/tesoreria";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withAuth(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const diario = Number(sp.get("diario"));
  const hoy = hoyAR();
  const desde = sp.get("desde") ?? hoy;
  const hasta = sp.get("hasta") ?? hoy;
  // `hasta` puede ser futuro: Mes y Año en curso terminan después de hoy
  if (!Number.isInteger(diario) || diario <= 0 || !FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta || desde > hoy) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }
  try {
    return NextResponse.json(await armarExtracto(diario, desde, hasta));
  } catch (e) {
    if (e instanceof DiarioInvalido) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}, { roles: ["ADMIN", "TESORERO"] });
