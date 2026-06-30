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
      {
        id: number;
        name: string;
        attributeId: number;
        equivalencia: string;
        hexColor: string;
        colorBase: string;
      }
    > = {};
    if (allValueIds.length > 0) {
      const values = await odoo.read(
        "product.attribute.value",
        [...new Set(allValueIds)],
        [
          "id",
          "name",
          "attribute_id",
          "x_studio_equivalencias",
          "html_color",
          "x_studio_color_base",
        ],
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
          hexColor: v.html_color || "",
          colorBase: v.x_studio_color_base || "",
        };
      }
    }

    const colors: {
      id: number;
      name: string;
      colorBase: string;
      hexColor: string;
      isNew: boolean;
    }[] = [];
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
            hexColor: "",
            colorBase: "",
          },
      );

      if (colorAttrId && attrId === colorAttrId) {
        colors.push(
          ...vals.map(
            (v: {
              id: number;
              name: string;
              colorBase: string;
              hexColor: string;
            }) => ({
              id: v.id,
              name: v.name,
              colorBase: v.colorBase || "",
              hexColor: v.hexColor || "",
              isNew: false,
            }),
          ),
        );
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

    // Fetch barcodes from product.product variants
    // barcodeMap: colorPavId → { sizeName → barcode }
    const barcodeMap: Record<number, Record<string, string>> = {};

    if (colors.length > 0 && sizes.length > 0) {
      const variants = await odoo.searchRead(
        "product.product",
        [["product_tmpl_id", "=", templateId]],
        ["id", "barcode", "product_template_attribute_value_ids"],
      );

      const allPtavIds = [
        ...new Set(
          variants.flatMap(
            (v: { product_template_attribute_value_ids: number[] }) =>
              v.product_template_attribute_value_ids || [],
          ),
        ),
      ];

      const ptavMap: Record<number, { attrId: number; pavId: number }> = {};
      if (allPtavIds.length > 0) {
        const ptavs = await odoo.read(
          "product.template.attribute.value",
          allPtavIds as number[],
          ["id", "attribute_id", "product_attribute_value_id"],
        );
        for (const ptav of ptavs) {
          const attrId = Array.isArray(ptav.attribute_id)
            ? ptav.attribute_id[0]
            : ptav.attribute_id;
          const pavId = Array.isArray(ptav.product_attribute_value_id)
            ? ptav.product_attribute_value_id[0]
            : ptav.product_attribute_value_id;
          ptavMap[ptav.id] = { attrId, pavId };
        }
      }

      for (const variant of variants) {
        if (!variant.barcode) continue;
        let colorPavId: number | null = null;
        let sizePavId: number | null = null;
        for (const ptavId of variant.product_template_attribute_value_ids ||
          []) {
          const ptav = ptavMap[ptavId];
          if (!ptav) continue;
          if (colorAttrId && ptav.attrId === colorAttrId) colorPavId = ptav.pavId;
          if (sizeAttrIdSet.has(ptav.attrId)) sizePavId = ptav.pavId;
        }
        if (colorPavId == null || sizePavId == null) continue;
        const sizeName = valueMap[sizePavId]?.name;
        if (!sizeName) continue;
        if (!barcodeMap[colorPavId]) barcodeMap[colorPavId] = {};
        barcodeMap[colorPavId][sizeName] = variant.barcode as string;
      }
    }

    return NextResponse.json({
      colors,
      sizes,
      sizeAttributeId,
      extraAttributes,
      maxCoeficiente,
      barcodeMap,
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
