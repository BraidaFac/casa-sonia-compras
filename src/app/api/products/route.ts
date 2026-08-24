import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export const GET = withAuth(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q") || "";

  try {
    // Search variants by barcode to get matching template IDs
    const variantMatches = await odoo.searchRead(
      "product.product",
      [["barcode", "ilike", q]],
      ["product_tmpl_id"],
      { limit: 50 },
    );
    const tmplIdsFromBarcode: number[] = [
      ...new Set(
        (variantMatches as { product_tmpl_id: [number, string] | false }[])
          .map((v) => (v.product_tmpl_id ? v.product_tmpl_id[0] : null))
          .filter((id): id is number => id !== null),
      ),
    ];

    const domain =
      tmplIdsFromBarcode.length > 0
        ? ["|", "|", ["name", "ilike", q], ["default_code", "ilike", q.toUpperCase()], ["id", "in", tmplIdsFromBarcode]]
        : ["|", ["name", "ilike", q], ["default_code", "ilike", q.toUpperCase()]];

    const templates = await odoo.searchRead(
      "product.template",
      domain,
      ["id", "name", "x_studio_referencia", "default_code", "list_price", "categ_id"],
      { limit: 20 },
    );

    const result = templates.map(
      (t: {
        id: number;
        name: string;
        x_studio_referencia?: string;
        default_code?: string;
        list_price?: number;
        categ_id?: [number, string] | false;
      }) => {
        const categoryRaw = t.categ_id;
        return {
          id: t.id,
          name: t.name,
          referencia: t.x_studio_referencia || "",
          defaultCode: t.default_code || "",
          listPrice: t.list_price || 0,
          category: categoryRaw
            ? {
                id: categoryRaw[0],
                name: categoryRaw[1],
                completeName: categoryRaw[1],
              }
            : null,
        };
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error fetching products",
      },
      { status: 500 },
    );
  }
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
