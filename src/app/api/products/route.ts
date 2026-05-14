import { NextRequest, NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";
import type { ProductAttribute } from "@/types";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";

  try {
    // Get color, size, and product-type attribute IDs
    const attributes = await odoo.searchRead(
      "product.attribute",
      [
        "|",
        "|",
        ["name", "ilike", "Color"],
        ["name", "ilike", "Talle"],
        ["name", "ilike", "Tipo de Producto"],
      ],
      ["id", "name"],
    );

    const colorAttr = attributes.find((a: { id: number; name: string }) =>
      a.name.toLowerCase().includes("color"),
    );
    const sizeAttr = attributes.find((a: { id: number; name: string }) =>
      a.name.toLowerCase().includes("talle"),
    );
    const typeAttr = attributes.find((a: { id: number; name: string }) =>
      a.name.toLowerCase().includes("tipo de producto"),
    );

    // Search product templates
    const templates = await odoo.searchRead(
      "product.template",
      [["name", "ilike", q]],
      [
        "id",
        "name",
        "attribute_line_ids",
        "x_studio_referencia",
        "default_code",
        "list_price",
      ],
      { limit: 20 },
    );

    if (templates.length === 0) return NextResponse.json([]);

    // Get all attribute line IDs
    const allLineIds: number[] = templates.flatMap(
      (t: { attribute_line_ids: number[] }) => t.attribute_line_ids || [],
    );

    if (allLineIds.length === 0) {
      return NextResponse.json(
        templates.map(
          (t: {
            id: number;
            name: string;
            x_studio_referencia?: string;
            default_code?: string;
            list_price?: number;
          }) => ({
            id: t.id,
            name: t.name,
            referencia: t.x_studio_referencia || "",
            defaultCode: t.default_code || "",
            listPrice: t.list_price || 0,
            maxCoeficiente: 0,
            colors: [],
            sizes: [],
            extraAttributes: [],
          }),
        ),
      );
    }

    const lines = await odoo.read(
      "product.template.attribute.line",
      [...new Set(allLineIds)],
      ["id", "attribute_id", "value_ids", "product_tmpl_id"],
    );

    // Get all value IDs
    const allValueIds: number[] = lines.flatMap(
      (l: { value_ids: number[] }) => l.value_ids || [],
    );

    const valueMap: Record<number, { id: number; name: string }> = {};
    if (allValueIds.length > 0) {
      const values = await odoo.read(
        "product.attribute.value",
        [...new Set(allValueIds)],
        ["id", "name"],
      );
      for (const v of values) {
        valueMap[v.id] = { id: v.id, name: v.name };
      }
    }

    // Fetch coeficientes for Tipo de Producto values
    const typeCoefMap: Record<number, number> = {};
    if (typeAttr) {
      const typeValues = await odoo.searchRead(
        "product.attribute.value",
        [["attribute_id", "=", typeAttr.id]],
        ["id", "x_studio_coeficiente"],
      );
      for (const tv of typeValues) {
        typeCoefMap[tv.id] = tv.x_studio_coeficiente || 0;
      }
    }

    // Build a map: templateId → { colors, sizes, extraAttributes, maxCoeficiente }
    const templateAttrMap: Record<
      number,
      {
        colors: { id: number; name: string }[];
        sizes: { id: number; name: string }[];
        extraAttributes: ProductAttribute[];
        maxCoeficiente: number;
      }
    > = {};

    for (const line of lines) {
      const tmplId = Array.isArray(line.product_tmpl_id)
        ? line.product_tmpl_id[0]
        : line.product_tmpl_id;
      const attrId = Array.isArray(line.attribute_id)
        ? line.attribute_id[0]
        : line.attribute_id;
      const attrName = Array.isArray(line.attribute_id)
        ? line.attribute_id[1]
        : "";

      if (!templateAttrMap[tmplId]) {
        templateAttrMap[tmplId] = {
          colors: [],
          sizes: [],
          extraAttributes: [],
          maxCoeficiente: 0,
        };
      }

      const vals = (line.value_ids || []).map(
        (vid: number) => valueMap[vid] || { id: vid, name: String(vid) },
      );

      if (colorAttr && attrId === colorAttr.id) {
        templateAttrMap[tmplId].colors.push(...vals);
      } else if (sizeAttr && attrId === sizeAttr.id) {
        templateAttrMap[tmplId].sizes.push(...vals);
      } else if (typeAttr && attrId === typeAttr.id) {
        // Compute maxCoeficiente from type values
        const coefs = (line.value_ids || []).map(
          (vid: number) => typeCoefMap[vid] || 0,
        );
        const max = coefs.length > 0 ? Math.max(...coefs) : 0;
        if (max > templateAttrMap[tmplId].maxCoeficiente) {
          templateAttrMap[tmplId].maxCoeficiente = max;
        }
        templateAttrMap[tmplId].extraAttributes.push({
          attributeId: attrId,
          attributeName: attrName,
          values: vals,
          generatesVariants: false,
        });
      } else {
        templateAttrMap[tmplId].extraAttributes.push({
          attributeId: attrId,
          attributeName: attrName,
          values: vals,
          generatesVariants: false,
        });
      }
    }

    const result = templates.map(
      (t: {
        id: number;
        name: string;
        x_studio_referencia?: string;
        default_code?: string;
        list_price?: number;
      }) => ({
        id: t.id,
        name: t.name,
        referencia: t.x_studio_referencia || "",
        defaultCode: t.default_code || "",
        listPrice: t.list_price || 0,
        maxCoeficiente: templateAttrMap[t.id]?.maxCoeficiente || 0,
        colors: templateAttrMap[t.id]?.colors || [],
        sizes: templateAttrMap[t.id]?.sizes || [],
        extraAttributes: templateAttrMap[t.id]?.extraAttributes || [],
      }),
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
}
