import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

function parseIds(param: string | null): number[] {
  if (!param) return [];
  return param
    .split(",")
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0);
}

function parseStrings(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

type RawTemplate = {
  id: number;
  name: string;
  default_code: string | false;
  image_256: string | false;
};

type RawAttributeLine = {
  product_tmpl_id: [number, string] | number;
  value_ids: number[];
};

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);

  const categoryIds = parseIds(searchParams.get("categoryIds"));
  const colorBases = parseStrings(searchParams.get("colorBases"));
  const equivalencias = parseStrings(searchParams.get("equivalencias"));
  const brandValueIds = parseIds(searchParams.get("brandValueIds"));
  const corteValueIds = parseIds(searchParams.get("corteValueIds"));
  const materialValueIds = parseIds(searchParams.get("materialValueIds"));
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10)),
  );

  const hasFilters =
    categoryIds.length > 0 ||
    colorBases.length > 0 ||
    equivalencias.length > 0 ||
    brandValueIds.length > 0 ||
    corteValueIds.length > 0 ||
    materialValueIds.length > 0;

  if (!hasFilters) {
    return NextResponse.json({ items: [], total: 0, page: 1 });
  }

  try {
    // Round 1 — parallel: resolve equivalencias + colorBases + get brand attribute ID
    const [sizeValues, colorValues, brandAttrs] = await Promise.all([
      equivalencias.length > 0
        ? (odoo.searchRead(
            "product.attribute.value",
            [["x_studio_equivalencias", "in", equivalencias]],
            ["id"],
          ) as Promise<{ id: number }[]>)
        : Promise.resolve([] as { id: number }[]),
      colorBases.length > 0
        ? (odoo.searchRead(
            "product.attribute.value",
            [["x_studio_color_base", "in", colorBases]],
            ["id"],
          ) as Promise<{ id: number }[]>)
        : Promise.resolve([] as { id: number }[]),
      odoo.searchRead(
        "product.attribute",
        [["name", "ilike", "marca"]],
        ["id"],
        { limit: 1 },
      ) as Promise<{ id: number }[]>,
    ]);

    const sizeValueIds = sizeValues.map((v) => v.id);
    const colorValueIds = colorValues.map((v) => v.id);
    const brandAttrId: number | null = brandAttrs[0]?.id ?? null;

    // Build Odoo domain — AND between groups (each group is OR via "in" operator)
    const domain: unknown[] = [["active", "=", true]];
    if (categoryIds.length > 0) domain.push(["categ_id", "in", categoryIds]);
    if (colorValueIds.length > 0)
      domain.push(["attribute_line_ids.value_ids", "in", colorValueIds]); // resolved from colorBases
    if (sizeValueIds.length > 0)
      domain.push(["attribute_line_ids.value_ids", "in", sizeValueIds]);
    if (brandValueIds.length > 0)
      domain.push(["attribute_line_ids.value_ids", "in", brandValueIds]);
    if (corteValueIds.length > 0)
      domain.push(["attribute_line_ids.value_ids", "in", corteValueIds]);
    if (materialValueIds.length > 0)
      domain.push(["attribute_line_ids.value_ids", "in", materialValueIds]);

    const offset = (page - 1) * limit;

    // Round 2 — parallel: main results + total count
    const [rawItems, total] = await Promise.all([
      odoo.searchRead(
        "product.template",
        domain,
        ["id", "name", "default_code", "image_256"],
        { limit, offset, order: "name asc" },
      ) as Promise<RawTemplate[]>,
      odoo.call("product.template", "search_count", {
        domain,
      }) as Promise<number>,
    ]);

    const templateIds = rawItems.map((r) => r.id);

    // Round 3 — fetch brand attribute lines for these templates
    const brandMap: Record<number, string> = {};
    if (brandAttrId && templateIds.length > 0) {
      const brandLines = (await odoo.searchRead(
        "product.template.attribute.line",
        [
          ["product_tmpl_id", "in", templateIds],
          ["attribute_id", "=", brandAttrId],
        ],
        ["product_tmpl_id", "value_ids"],
      )) as RawAttributeLine[];

      if (brandLines.length > 0) {
        const allValueIds = [
          ...new Set(brandLines.flatMap((l) => l.value_ids)),
        ];
        const brandValues = (await odoo.searchRead(
          "product.attribute.value",
          [["id", "in", allValueIds]],
          ["id", "name"],
        )) as { id: number; name: string }[];

        const valueNameMap = Object.fromEntries(
          brandValues.map((v) => [v.id, v.name]),
        );

        for (const line of brandLines) {
          const tmplId = Array.isArray(line.product_tmpl_id)
            ? line.product_tmpl_id[0]
            : line.product_tmpl_id;
          const firstValueId = line.value_ids[0];
          if (firstValueId !== undefined && valueNameMap[firstValueId]) {
            brandMap[tmplId] = valueNameMap[firstValueId];
          }
        }
      }
    }

    const items = rawItems.map((r) => ({
      id: r.id,
      name: r.name,
      defaultCode: r.default_code || null,
      thumbUrl: r.image_256
        ? `data:image/jpeg;base64,${r.image_256}`
        : null,
      brand: brandMap[r.id] ?? null,
    }));

    return NextResponse.json({ items, total, page });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error filtering products",
      },
      { status: 500 },
    );
  }
});
