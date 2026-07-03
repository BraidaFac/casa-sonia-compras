import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { odoo } from "@/lib/odoo";
import { getAttrMetadata } from "@/lib/productCache";
import type { InventoryArticle } from "@/types";

export async function GET(request: NextRequest) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim();

  if (!code) {
    return NextResponse.json({ error: "code es requerido" }, { status: 400 });
  }

  const products = await odoo.searchRead(
    "product.product",
    [["barcode", "=", code]],
    [
      "id", "name", "barcode",
      "list_price", "standard_price",
      "product_tmpl_id", "product_template_attribute_value_ids",
      "categ_id", "qty_available",
    ],
  ) as {
    id: number;
    name: string;
    barcode: string | false;
    list_price: number;
    standard_price: number;
    product_tmpl_id: [number, string] | false;
    product_template_attribute_value_ids: number[];
    categ_id: [number, string] | false;
    qty_available: number;
  }[];

  if (products.length === 0) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const p = products[0];
  const templateId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : null;
  const ptavIds = p.product_template_attribute_value_ids || [];
  const categId = Array.isArray(p.categ_id) ? p.categ_id[0] : null;
  const categNameRaw = Array.isArray(p.categ_id) ? p.categ_id[1] : "";

  function extractLocalName(completeName: string): string {
    const parts = completeName.split(" / ");
    return parts[parts.length - 1] ?? completeName;
  }

  // Parallel: attr metadata + last purchase date + category parent
  const [{ sizeAttrIdSet, brandAttrId }, purchaseOrders, categoryData] = await Promise.all([
    getAttrMetadata(),
    odoo.searchRead(
      "purchase.order",
      [
        ["order_line.product_id", "=", p.id],
        ["state", "in", ["purchase", "done"]],
        ["date_approve", "!=", false],
      ],
      ["date_approve"],
      { order: "date_approve desc", limit: 1 },
    ) as Promise<{ date_approve: string }[]>,
    categId
      ? (odoo.read(
          "product.category",
          [categId],
          ["id", "name", "parent_id"],
        ) as Promise<{ id: number; name: string; parent_id: [number, string] | false }[]>)
      : Promise.resolve([]),
  ]);

  const lastPurchaseDate = purchaseOrders[0]?.date_approve ?? null;

  const categ = categoryData[0];
  const categoryParentId = categ && Array.isArray(categ.parent_id) ? categ.parent_id[0] : null;
  const rawParentDisplay = categ && Array.isArray(categ.parent_id) ? (categ.parent_id[1] as string) : null;
  const categoryParentName = rawParentDisplay ? extractLocalName(rawParentDisplay) : null;

  // Resolve size from variant PTAVs
  let size: string | null = null;
  let brandResolutionPtavs: { id: number; attribute_id: [number, string] | number; name: string }[] = [];

  if (ptavIds.length > 0) {
    brandResolutionPtavs = await odoo.read(
      "product.template.attribute.value",
      ptavIds,
      ["id", "attribute_id", "name"],
    ) as typeof brandResolutionPtavs;

    for (const ptav of brandResolutionPtavs) {
      const attrId = Array.isArray(ptav.attribute_id) ? ptav.attribute_id[0] : ptav.attribute_id;
      if (sizeAttrIdSet.has(attrId)) {
        size = ptav.name;
        break;
      }
    }
  }

  // Resolve brand from template attribute line (non-variant attribute)
  let brand: string | null = null;
  if (templateId && brandAttrId) {
    const brandLines = await odoo.searchRead(
      "product.template.attribute.line",
      [
        ["product_tmpl_id", "=", templateId],
        ["attribute_id", "=", brandAttrId],
      ],
      ["value_ids"],
    ) as { value_ids: number[] }[];

    const brandValueIds = brandLines[0]?.value_ids ?? [];
    if (brandValueIds.length > 0) {
      const brandValues = await odoo.read(
        "product.attribute.value",
        brandValueIds,
        ["name"],
      ) as { name: string }[];
      brand = brandValues[0]?.name ?? null;
    }
  }

  const article: InventoryArticle = {
    varianteId: p.id,
    productoId: templateId ?? 0,
    barcode: code,
    name: p.name,
    qty: 1,
    salePrice: p.list_price ?? 0,
    cost: p.standard_price ?? 0,
    lastPurchaseDate,
    size,
    brand,
    categoryId: categId ?? 0,
    categoryName: categ?.name ?? extractLocalName(categNameRaw),
    categoryParentId,
    categoryParentName,
    qtyOnHand: p.qty_available ?? 0,
  };

  return NextResponse.json(article);
}
