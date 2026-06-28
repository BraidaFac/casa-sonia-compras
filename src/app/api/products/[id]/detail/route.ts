import { NextRequest, NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";
import { getAttrMetadata } from "@/lib/productCache";
import type { ProductAttribute } from "@/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const templateId = parseInt(id, 10);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  try {
    const { colorAttrId, typeAttrId, sizeAttrIdSet, typeCoefMap } =
      await getAttrMetadata();

    const lines = await odoo.searchRead(
      "product.template.attribute.line",
      [["product_tmpl_id", "=", templateId]],
      ["id", "attribute_id", "value_ids", "product_tmpl_id"],
    );

    const allValueIds: number[] = lines.flatMap(
      (l: { value_ids: number[] }) => l.value_ids || [],
    );

    const valueMap: Record<
      number,
      { id: number; name: string; attributeId: number; equivalencia: string }
    > = {};
    if (allValueIds.length > 0) {
      const values = await odoo.read(
        "product.attribute.value",
        [...new Set(allValueIds)],
        ["id", "name", "attribute_id", "x_studio_equivalencias"],
      );
      for (const v of values) {
        const attrId = Array.isArray(v.attribute_id)
          ? v.attribute_id[0]
          : v.attribute_id || 0;
        valueMap[v.id] = {
          id: v.id,
          name: v.name,
          attributeId: attrId,
          equivalencia: v.x_studio_equivalencias || "",
        };
      }
    }

    const colors: { id: number; name: string }[] = [];
    const sizes: { id: number; name: string; equivalencia: string }[] = [];
    let sizeAttributeId: number | null = null;
    const extraAttributes: ProductAttribute[] = [];
    let maxCoeficiente = 0;

    for (const line of lines) {
      const attrId = Array.isArray(line.attribute_id)
        ? line.attribute_id[0]
        : line.attribute_id;
      const attrName = Array.isArray(line.attribute_id)
        ? line.attribute_id[1]
        : "";
      const vals = (line.value_ids || []).map(
        (vid: number) =>
          valueMap[vid] || {
            id: vid,
            name: String(vid),
            attributeId: 0,
            equivalencia: "",
          },
      );

      if (colorAttrId && attrId === colorAttrId) {
        colors.push(...vals);
      } else if (sizeAttrIdSet.has(attrId)) {
        sizes.push(
          ...vals.map(
            (v: { id: number; name: string; equivalencia: string }) => ({
              id: v.id,
              name: v.name,
              equivalencia: v.equivalencia || "",
            }),
          ),
        );
        if (!sizeAttributeId) sizeAttributeId = attrId;
      } else if (typeAttrId && attrId === typeAttrId) {
        const coefs = (line.value_ids || []).map(
          (vid: number) => typeCoefMap[vid] || 0,
        );
        const max = coefs.length > 0 ? Math.max(...coefs) : 0;
        if (max > maxCoeficiente) maxCoeficiente = max;
        extraAttributes.push({
          attributeId: attrId,
          attributeName: attrName,
          values: vals,
          generatesVariants: false,
        });
      } else {
        extraAttributes.push({
          attributeId: attrId,
          attributeName: attrName,
          values: vals,
          generatesVariants: false,
        });
      }
    }

    return NextResponse.json({
      colors,
      sizes,
      sizeAttributeId,
      extraAttributes,
      maxCoeficiente,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error fetching product detail",
      },
      { status: 500 },
    );
  }
}
