import { NextRequest, NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";
import type { ColorImages } from "@/types";

interface ResolvedColor {
  id: number;
  name: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const templateId = parseInt(id, 10);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const body = await request.json();
  const {
    colorImages = {},
    deletedOdooImageIds = [],
    clearedPrimaryColorNames = [],
    resolvedColors = [],
    variantMap: variantMapEntries = [],
  } = body as {
    colorImages: ColorImages;
    deletedOdooImageIds: number[];
    clearedPrimaryColorNames: string[];
    resolvedColors: ResolvedColor[];
    variantMap: [string, number][];
  };

  const variantMap = new Map<string, number>(variantMapEntries);

  // Delete removed additional images
  if (deletedOdooImageIds.length > 0) {
    try {
      await odoo.unlink("product.image", deletedOdooImageIds);
    } catch (err) {
      console.error("Error eliminando imágenes de Odoo:", err);
    }
  }

  // Clear primary image for colors where user removed all images
  for (const colorName of clearedPrimaryColorNames) {
    const resolvedColor = resolvedColors.find(
      (c) => c.name.toLowerCase() === colorName.toLowerCase(),
    );
    if (!resolvedColor) continue;
    const variantIdsForColor: number[] = [];
    for (const [key, variantId] of variantMap.entries()) {
      if (key.startsWith(`${resolvedColor.id}:`)) variantIdsForColor.push(variantId);
    }
    if (variantIdsForColor.length > 0) {
      try {
        await odoo.write("product.product", variantIdsForColor, { image_variant_1920: false });
      } catch (err) {
        console.error(`Error limpiando imagen primaria para color ${colorName}:`, err);
      }
    }
  }

  if (!colorImages || Object.keys(colorImages).length === 0) {
    return NextResponse.json({ ok: true });
  }

  for (const [colorName, images] of Object.entries(colorImages)) {
    const validImages = images.filter((img) => img.base64 && !img.error);
    if (validImages.length === 0) continue;

    const resolvedColor = resolvedColors.find(
      (c) => c.name.toLowerCase() === colorName.toLowerCase(),
    );
    if (!resolvedColor) continue;

    const primaryImage = validImages[0];

    const variantIdsForColor: number[] = [];
    for (const [key, variantId] of variantMap.entries()) {
      if (key.startsWith(`${resolvedColor.id}:`)) variantIdsForColor.push(variantId);
    }

    if (variantIdsForColor.length > 0 && !primaryImage.isFromOdoo) {
      try {
        await odoo.write("product.product", variantIdsForColor, {
          image_variant_1920: primaryImage.base64,
        });
      } catch (err) {
        console.error(`Error seteando imagen principal para color ${colorName}:`, err);
      }
    }

    const newAdditionalImages = validImages.slice(1).filter((img) => !img.odooId);
    for (const img of newAdditionalImages) {
      try {
        await odoo.create("product.image", {
          product_tmpl_id: templateId,
          name: `${colorName} - ${img.fileName}`,
          image_1920: img.base64,
        });
      } catch (err) {
        console.error(`Error agregando imagen adicional para color ${colorName}:`, err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
