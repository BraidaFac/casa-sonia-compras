import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";
import type { ColorImages } from "@/types";

interface ResolvedColor {
  id: number;
  name: string;
}

export const POST = withAuth(async (req: NextRequest, _payload, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const templateId = parseInt(id, 10);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const body = await req.json();
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

  let templateImageWritten = false; // write image_1920 on template once (first new primary)

  for (const [colorName, images] of Object.entries(colorImages)) {
    if (images.length === 0) continue;

    const resolvedColor = resolvedColors.find(
      (c) => c.name.toLowerCase() === colorName.toLowerCase(),
    );
    if (!resolvedColor) continue;

    const variantIdsForColor: number[] = [];
    for (const [key, variantId] of variantMap.entries()) {
      if (key.startsWith(`${resolvedColor.id}:`)) variantIdsForColor.push(variantId);
    }

    // Primary slot: first image in array.
    // Odoo images have isFromOdoo=true and base64="" (stripped client-side to save payload).
    // New images have base64 populated and no isFromOdoo flag.
    const primaryImage = images[0];

    if (variantIdsForColor.length > 0 && !primaryImage.isFromOdoo && primaryImage.base64) {
      try {
        await odoo.write("product.product", variantIdsForColor, {
          image_variant_1920: primaryImage.base64,
        });

        // Also set the template-level image_1920 once (first new primary wins)
        if (!templateImageWritten) {
          try {
            await odoo.write("product.template", [templateId], {
              image_1920: primaryImage.base64,
            });
            templateImageWritten = true;
          } catch (err) {
            console.error(`Error seteando imagen del template para color ${colorName}:`, err);
          }
        }
      } catch (err) {
        console.error(`Error seteando imagen principal para color ${colorName}:`, err);
      }
    }

    // Additional images: everything after the primary that is new (no odooId, has base64)
    const newAdditionalImages = images.slice(1).filter((img) => !img.odooId && img.base64 && !img.error);
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
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
