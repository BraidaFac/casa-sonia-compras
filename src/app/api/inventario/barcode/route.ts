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
  const varianteIdStr = searchParams.get("varianteId");
  const varianteId = varianteIdStr ? parseInt(varianteIdStr) : null;
  const warehouseId = searchParams.get("warehouseId");

  if (!code && !varianteId) {
    return NextResponse.json({ error: "code o varianteId es requerido" }, { status: 400 });
  }

  const fields = [
    "id", "name", "barcode", "default_code",
    "list_price", "standard_price",
    "product_tmpl_id", "product_template_attribute_value_ids",
    "categ_id",
  ];

  type OdooProduct = {
    id: number;
    name: string;
    barcode: string | false;
    default_code: string | false;
    list_price: number;
    standard_price: number;
    product_tmpl_id: [number, string] | false;
    product_template_attribute_value_ids: number[];
    categ_id: [number, string] | false;
  };

  let products: OdooProduct[];

  if (varianteId) {
    products = await odoo.searchRead("product.product", [["id", "=", varianteId]], fields) as OdooProduct[];
  } else {
    // Exact barcode match first
    products = await odoo.searchRead("product.product", [["barcode", "=", code]], fields) as OdooProduct[];

    // Fallback: barcodes in Odoo may have irregular spacing (e.g. "4DRO1420         42").
    // Replace any whitespace run in the typed code with % wildcard and retry with ilike.
    if (products.length === 0 && code && /\s/.test(code)) {
      const pattern = code.replace(/\s+/g, "%");
      products = await odoo.searchRead("product.product", [["barcode", "ilike", pattern]], fields) as OdooProduct[];
    }
  }

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

  // Resolve warehouse-specific qty on hand via stock.quant
  let qtyOnHand = 0;
  if (warehouseId) {
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
      const quants = await odoo.searchRead(
        "stock.quant",
        [["product_id", "=", p.id], ["location_id", "in", locationIds]],
        ["quantity"],
      ) as { quantity: number }[];
      qtyOnHand = quants.reduce((s, q) => s + (q.quantity ?? 0), 0);
    }
  }

  // Parallel: attr metadata + last purchase date + category parent
  const [{ sizeAttrIdSet, brandAttrId, colorAttrId }, purchaseOrders, categoryData] = await Promise.all([
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

  // Resolve color from variant PTAVs
  let color: string | null = null;
  for (const ptav of brandResolutionPtavs) {
    const attrId = Array.isArray(ptav.attribute_id) ? ptav.attribute_id[0] : ptav.attribute_id;
    if (colorAttrId && attrId === colorAttrId) {
      color = ptav.name;
      break;
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
    barcode: (p.barcode as string | false) || code || "",
    defaultCode: (p.default_code as string | false) || null,
    name: p.name,
    qty: 1,
    salePrice: p.list_price ?? 0,
    cost: p.standard_price ?? 0,
    lastPurchaseDate,
    size,
    brand,
    color,
    categoryId: categId ?? 0,
    categoryName: categ?.name ?? extractLocalName(categNameRaw),
    categoryParentId,
    categoryParentName,
    qtyOnHand,
  };

  return NextResponse.json(article);
}
