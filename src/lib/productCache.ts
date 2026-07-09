import { odoo } from "@/lib/odoo";

const TTL_MS = 4.5 * 60 * 60 * 1000; // 4.5 hours

interface AttrMetadata {
  colorAttrId: number | null;
  typeAttrId: number | null;
  brandAttrId: number | null;
  sizeAttrIds: number[];
  typeCoefMap: Record<number, number>;
  exp: number;
}

let _cache: AttrMetadata | null = null;

export async function getAttrMetadata() {
  if (_cache && Date.now() < _cache.exp) {
    return {
      colorAttrId: _cache.colorAttrId,
      typeAttrId: _cache.typeAttrId,
      brandAttrId: _cache.brandAttrId,
      sizeAttrIdSet: new Set(_cache.sizeAttrIds),
      typeCoefMap: _cache.typeCoefMap,
    };
  }

  const attributes = await odoo.searchRead(
    "product.attribute",
    ["|", "|", ["name", "ilike", "Color"], ["name", "ilike", "Tipo de Producto"], ["name", "ilike", "Marca"]],
    ["id", "name"],
  );
  const colorAttr = attributes.find((a: { name: string }) =>
    a.name.toLowerCase().includes("color"),
  );
  const typeAttr = attributes.find((a: { name: string }) =>
    a.name.toLowerCase().includes("tipo de producto"),
  );
  const brandAttr = attributes.find((a: { name: string }) =>
    a.name.toLowerCase().includes("marca"),
  );

  const sizeAttrRaw = await odoo.searchRead(
    "product.attribute",
    ["|", ["name", "ilike", "Talle"], ["name", "ilike", "Tamaño"]],
    ["id", "name", "create_variant"],
  );
  const sizeAttrIds: number[] = sizeAttrRaw
    .filter((a: { create_variant: string }) => a.create_variant === "always")
    .map((a: { id: number }) => a.id);

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

  _cache = {
    colorAttrId: colorAttr?.id ?? null,
    typeAttrId: typeAttr?.id ?? null,
    brandAttrId: brandAttr?.id ?? null,
    sizeAttrIds,
    typeCoefMap,
    exp: Date.now() + TTL_MS,
  };

  return {
    colorAttrId: _cache.colorAttrId,
    typeAttrId: _cache.typeAttrId,
    brandAttrId: _cache.brandAttrId,
    sizeAttrIdSet: new Set(sizeAttrIds),
    typeCoefMap: _cache.typeCoefMap,
  };
}

export function clearAttrCache() {
  _cache = null;
}
