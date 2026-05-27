import { NextRequest, NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";
import type { ColorImages, ProductImage } from "@/types";

function sanitizeBase64(raw: string): string {
  // Odoo sometimes returns base64 with newlines or a data URL prefix — strip both
  const stripped = raw.replace(/\s/g, "");
  const dataUrlPrefix = stripped.indexOf("base64,");
  return dataUrlPrefix !== -1 ? stripped.slice(dataUrlPrefix + 7) : stripped;
}

function detectMimeType(base64: string): string {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("R0lGO")) return "image/gif";
  return "image/jpeg";
}

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
    const colorImages: ColorImages = {};

    // Get color attribute ID
    const colorAttrs = await odoo.searchRead(
      "product.attribute",
      [["name", "ilike", "Color"]],
      ["id", "name"],
    );
    const colorAttr = colorAttrs.find((a: { name: string }) =>
      a.name.toLowerCase().includes("color"),
    );
    if (!colorAttr) return NextResponse.json({});

    // Fetch variants with primary images
    const variants = await odoo.searchRead(
      "product.product",
      [["product_tmpl_id", "=", templateId]],
      ["id", "product_template_attribute_value_ids", "image_variant_1920"],
    );

    if (variants.length === 0) return NextResponse.json({});

    // Map PTAV IDs → color name
    const allPtavIds: number[] = variants.flatMap(
      (v: { product_template_attribute_value_ids: number[] }) =>
        v.product_template_attribute_value_ids || [],
    );

    const ptavColorMap: Record<number, string> = {};
    if (allPtavIds.length > 0) {
      const ptavs = await odoo.read(
        "product.template.attribute.value",
        [...new Set(allPtavIds)],
        ["id", "attribute_id", "product_attribute_value_id"],
      );

      // Collect PAV IDs for color PTAVs
      const colorPtavToPavId: Record<number, number> = {};
      for (const ptav of ptavs) {
        const attrId = Array.isArray(ptav.attribute_id)
          ? ptav.attribute_id[0]
          : ptav.attribute_id;
        if (attrId === colorAttr.id) {
          const pavId = Array.isArray(ptav.product_attribute_value_id)
            ? ptav.product_attribute_value_id[0]
            : ptav.product_attribute_value_id;
          colorPtavToPavId[ptav.id] = pavId;
        }
      }

      // Read PAV records directly to get clean name (not the Many2one display name)
      const pavIds = [...new Set(Object.values(colorPtavToPavId))];
      if (pavIds.length > 0) {
        const pavs = await odoo.read(
          "product.attribute.value",
          pavIds,
          ["id", "name"],
        );
        const pavNameMap: Record<number, string> = {};
        for (const pav of pavs) {
          pavNameMap[pav.id] = pav.name;
        }
        for (const [ptavId, pavId] of Object.entries(colorPtavToPavId)) {
          ptavColorMap[Number(ptavId)] = pavNameMap[pavId] ?? "";
        }
      }
    }

    // Build primary image per color (first variant with image wins)
    for (const variant of variants) {
      if (!variant.image_variant_1920) continue;
      const ptavIds: number[] = variant.product_template_attribute_value_ids || [];
      let colorName: string | null = null;
      for (const ptavId of ptavIds) {
        if (ptavColorMap[ptavId]) {
          colorName = ptavColorMap[ptavId];
          break;
        }
      }
      if (!colorName || colorImages[colorName]) continue;

      const base64 = sanitizeBase64(variant.image_variant_1920);
      const mimeType = detectMimeType(base64);
      colorImages[colorName] = [
        {
          id: crypto.randomUUID(),
          fileName: `${colorName}_primary.jpg`,
          base64,
          mimeType,
          previewUrl: `data:${mimeType};base64,${base64}`,
          isFromOdoo: true,
        } satisfies ProductImage,
      ];
    }

    // Fetch additional images stored via product_template_image_ids
    // Name format: "${colorName} - ${fileName}" (see syncProductImages in orders/route.ts)
    const additionalImgs = await odoo.searchRead(
      "product.image",
      [["product_tmpl_id", "=", templateId]],
      ["id", "name", "image_1920"],
    );

    for (const img of additionalImgs) {
      if (!img.image_1920) continue;
      const nameParts = (img.name || "").split(" - ");
      if (nameParts.length < 2) continue;
      const colorName = nameParts[0];
      const fileName = nameParts.slice(1).join(" - ");

      if (!colorImages[colorName]) continue; // skip if no primary for this color

      const base64 = sanitizeBase64(img.image_1920);
      const mimeType = detectMimeType(base64);
      colorImages[colorName].push({
        id: crypto.randomUUID(),
        fileName,
        base64,
        mimeType,
        previewUrl: `data:${mimeType};base64,${base64}`,
        isFromOdoo: true,
        odooId: img.id,
      } satisfies ProductImage);
    }

    return NextResponse.json(colorImages);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error fetching product images",
      },
      { status: 500 },
    );
  }
}
