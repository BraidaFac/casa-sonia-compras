import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { odoo } from "@/lib/odoo";

export interface VariantSearchResult {
  varianteId: number;
  name: string;
  barcode: string | null;
  defaultCode: string | null;
  qtyOnHand: number;
}

export async function GET(request: NextRequest) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const warehouseId = searchParams.get("warehouseId");

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  // Size tokens: pure numbers (28, 36, 42...) or letter sizes (XS/S/M/L/XL/XXL/2XL...10XL)
  // These live in product_template_attribute_value_ids.name, NOT in product name
  const SIZE_RE = /^(\d+|xs|s|m|l|xl|xxl|xxxl|[2-9]xl|10xl)$/i;
  const isSizeToken = (w: string) => SIZE_RE.test(w);

  const words = q.split(/\s+/).filter((w) => w.length > 0);

  // AND-combine flat Odoo domain fragments: ["&", ...frag1, ...frag2, ...]
  function andFragments(frags: unknown[][]): unknown[] {
    if (frags.length === 1) return frags[0];
    return ["&", ...frags[0], ...andFragments(frags.slice(1))];
  }

  // Fragment for a single token: size → attr value; other → name OR barcode OR default_code
  function tokenFragment(w: string): unknown[] {
    if (isSizeToken(w)) {
      return [["product_template_attribute_value_ids.name", "ilike", w]];
    }
    return ["|", "|", ["name", "ilike", w], ["barcode", "ilike", w], ["default_code", "ilike", w]];
  }

  let domain: unknown[];
  if (words.length === 1) {
    const w = words[0];
    if (isSizeToken(w)) {
      // Single size token: attribute values OR product name
      domain = ["|", ["product_template_attribute_value_ids.name", "ilike", w], ["name", "ilike", w]];
    } else {
      domain = tokenFragment(w);
    }
  } else {
    // Multi-word: AND of per-token fragments
    // size tokens → attribute value; others → name OR barcode OR default_code
    domain = andFragments(words.map(tokenFragment));
  }

  const products = await odoo.searchRead(
    "product.product",
    domain,
    ["id", "name", "barcode", "default_code"],
    { limit: 15 },
  ) as {
    id: number;
    name: string;
    barcode: string | false;
    default_code: string | false;
  }[];

  const qtyMap: Record<number, number> = {};

  if (warehouseId && products.length > 0) {
    const locations = await odoo.searchRead(
      "stock.location",
      [
        ["warehouse_id", "=", parseInt(warehouseId)],
        ["usage", "=", "internal"],
        ["active", "=", true],
      ],
      ["id"],
    ) as { id: number }[];

    const locationIds = locations.map((l) => l.id);
    if (locationIds.length > 0) {
      const productIds = products.map((p) => p.id);
      const quants = await odoo.searchRead(
        "stock.quant",
        [["product_id", "in", productIds], ["location_id", "in", locationIds]],
        ["product_id", "quantity"],
      ) as { product_id: [number, string]; quantity: number }[];

      for (const quant of quants) {
        const pid = quant.product_id[0];
        qtyMap[pid] = (qtyMap[pid] ?? 0) + quant.quantity;
      }
    }
  }

  const result: VariantSearchResult[] = products.map((p) => ({
    varianteId: p.id,
    name: p.name,
    barcode: p.barcode || null,
    defaultCode: p.default_code || null,
    qtyOnHand: qtyMap[p.id] ?? 0,
  }));

  return NextResponse.json(result);
}
