import { odoo } from "./odoo";
import { LETTER_SIZES } from "./sizes";

// Cache de ubicaciones internas — TTL 12 horas (cambian raramente)
const LOCATIONS_TTL_MS = 12 * 60 * 60 * 1000;
type LocationEntry = {
  id: number;
  name: string;
  completeName: string;
  warehouseId: number | null;
  warehouseName: string | null;
};
let _locationsCache: { data: LocationEntry[]; exp: number } | null = null;

// ASSUMPTION: El campo barcode en product.product se llama "barcode"
// ASSUMPTION: Los atributos de Color contienen "color" en el nombre (case-insensitive)
// ASSUMPTION: Los atributos de Talle contienen "talle" o "talle" en el nombre, o sus valores son talles conocidos
// ASSUMPTION: Las imágenes de variante están en image_variant_1920; si vacío, usar imagen de plantilla
// ASSUMPTION: Los atributos descriptivos (Marca, Material, etc.) están en attribute_line_ids de product.template
// ASSUMPTION: list_price en product.template es el precio de venta al público

const LETTER_SIZE_SET = new Set(LETTER_SIZES.map((s) => s.toLowerCase()));

function isSizeValue(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (LETTER_SIZE_SET.has(lower)) return true;
  // numeric size: e.g. "38", "40", "42"
  if (/^\d+$/.test(lower)) return true;
  // common patterns: "2XL", "3XL", etc.
  if (/^\d+xl$/i.test(lower)) return true;
  return false;
}

function isSizeAttribute(attrName: string, valueNames: string[]): boolean {
  const lower = attrName.toLowerCase();
  if (lower.includes("talle") || lower.includes("size") || lower.includes("talla")) return true;
  // if most values look like sizes
  if (valueNames.length > 0 && valueNames.filter(isSizeValue).length >= valueNames.length * 0.6) return true;
  return false;
}

function isColorAttribute(attrName: string): boolean {
  const lower = attrName.toLowerCase();
  return lower.includes("color") || lower.includes("colour");
}

export async function getProductByBarcode(barcode: string): Promise<{
  variantId: number;
  templateId: number;
  colorAttributeValueId: number | null;
  sizeAttributeValueId: number | null;
} | null> {
  // Try exact barcode match first, then default_code
  let ids: number[] = await odoo.search("product.product", [
    ["barcode", "=", barcode],
    ["active", "=", true],
  ]);

  if (ids.length === 0) {
    ids = await odoo.search("product.product", [
      ["default_code", "=", barcode],
      ["active", "=", true],
    ]);
  }

  if (ids.length === 0) return null;

  const variantId = ids[0];
  const [variant] = await odoo.read("product.product", [variantId], [
    "product_tmpl_id",
    "product_template_attribute_value_ids",
  ]);

  const templateId = Array.isArray(variant.product_tmpl_id)
    ? variant.product_tmpl_id[0]
    : variant.product_tmpl_id;

  const ptavIds: number[] = variant.product_template_attribute_value_ids ?? [];

  let colorAttributeValueId: number | null = null;
  let sizeAttributeValueId: number | null = null;

  if (ptavIds.length > 0) {
    const ptavs = await odoo.read(
      "product.template.attribute.value",
      ptavIds,
      ["attribute_id", "product_attribute_value_id", "name"],
    );
    for (const ptav of ptavs) {
      const attrName: string = Array.isArray(ptav.attribute_id)
        ? ptav.attribute_id[1]
        : "";
      const valueId = Array.isArray(ptav.product_attribute_value_id)
        ? ptav.product_attribute_value_id[0]
        : ptav.product_attribute_value_id;
      if (isColorAttribute(attrName)) {
        colorAttributeValueId = valueId;
      } else if (isSizeAttribute(attrName, [])) {
        sizeAttributeValueId = valueId;
      }
    }
  }

  return { variantId, templateId, colorAttributeValueId, sizeAttributeValueId };
}

export async function getInternalLocations(): Promise<LocationEntry[]> {
  if (_locationsCache && Date.now() < _locationsCache.exp) {
    return _locationsCache.data;
  }

  const [locations, warehouses] = await Promise.all([
    odoo.searchRead(
      "stock.location",
      [["usage", "=", "internal"], ["active", "=", true]],
      ["id", "name", "complete_name"],
      { order: "complete_name asc", limit: 0 },
    ),
    odoo.searchRead(
      "stock.warehouse",
      [["active", "=", true]],
      ["id", "name", "view_location_id"],
      { limit: 0 },
    ),
  ]);

  // view_location_id comes as [id, name] — the name is the first segment of complete_name
  // for all child locations of that warehouse.
  const warehouseByPrefix = new Map<string, { id: number; name: string }>();
  for (const wh of warehouses as Array<{ id: number; name: string; view_location_id: [number, string] | false }>) {
    if (wh.view_location_id) {
      warehouseByPrefix.set(wh.view_location_id[1], { id: wh.id, name: wh.name });
    }
  }

  const data = (locations as Array<{ id: number; name: string; complete_name: string }>).map((r) => {
    const prefix = r.complete_name.split("/")[0];
    const wh = warehouseByPrefix.get(prefix) ?? null;
    return {
      id: r.id,
      name: r.name,
      completeName: r.complete_name,
      warehouseId: wh?.id ?? null,
      warehouseName: wh?.name ?? null,
    };
  });

  _locationsCache = { data, exp: Date.now() + LOCATIONS_TTL_MS };
  return data;
}

export async function getStockByTemplate(templateId: number): Promise<Array<{
  variantId: number;
  locationId: number;
  qty: number;
}>> {
  const results = await odoo.searchRead(
    "stock.quant",
    [
      ["product_id.product_tmpl_id", "=", templateId],
      ["location_id.usage", "=", "internal"],
      ["location_id.active", "=", true],
    ],
    ["product_id", "location_id", "quantity"],
    { limit: 0 },
  );

  return results.map((r: { product_id: [number, string] | number; location_id: [number, string] | number; quantity: number }) => ({
    variantId: Array.isArray(r.product_id) ? r.product_id[0] : r.product_id,
    locationId: Array.isArray(r.location_id) ? r.location_id[0] : r.location_id,
    qty: r.quantity,
  }));
}

export async function getProductTemplate(templateId: number): Promise<{
  templateId: number;
  name: string;
  ref: string | null;
  listPrice: number | null;
  categoryId: number | null;
  variants: Array<{
    id: number;
    colorAttributeValueId: number | null;
    colorName: string | null;
    sizeAttributeValueId: number | null;
    sizeName: string | null;
    imageUrl: string | null;
  }>;
  attributes: Array<{ label: string; value: string }>;
} | null> {
  const templates = await odoo.read("product.template", [templateId], [
    "id",
    "name",
    "default_code",
    "list_price",
    "categ_id",
    "image_512",
    "product_variant_ids",
    "attribute_line_ids",
  ]);

  if (!templates || templates.length === 0) return null;
  const tmpl = templates[0];

  const variantIds: number[] = tmpl.product_variant_ids ?? [];
  const attrLineIds: number[] = tmpl.attribute_line_ids ?? [];

  // Parallel: fetch variants + attribute lines
  const [variantsRaw, attrLinesRaw] = await Promise.all([
    variantIds.length > 0
      ? odoo.read("product.product", variantIds, [
          "id",
          "product_template_attribute_value_ids",
          "image_variant_512",
        ])
      : Promise.resolve([]),
    attrLineIds.length > 0
      ? odoo.read("product.template.attribute.line", attrLineIds, [
          "attribute_id",
          "value_ids",
        ])
      : Promise.resolve([]),
  ]);

  // Collect all ptav ids from all variants
  const allPtavIds = new Set<number>();
  for (const v of variantsRaw) {
    for (const id of (v.product_template_attribute_value_ids ?? [])) {
      allPtavIds.add(id);
    }
  }

  // Fetch ptav details
  const ptavMap: Map<number, { attrName: string; valueName: string; valueId: number }> = new Map();
  if (allPtavIds.size > 0) {
    const ptavs = await odoo.read(
      "product.template.attribute.value",
      Array.from(allPtavIds),
      ["attribute_id", "product_attribute_value_id", "name"],
    );
    for (const ptav of ptavs) {
      const attrName: string = Array.isArray(ptav.attribute_id) ? ptav.attribute_id[1] : "";
      const valueId: number = Array.isArray(ptav.product_attribute_value_id)
        ? ptav.product_attribute_value_id[0]
        : ptav.product_attribute_value_id;
      const valueName: string = ptav.name ?? "";
      ptavMap.set(ptav.id, { attrName, valueName, valueId });
    }
  }

  // Build variants
  const variants = variantsRaw.map((v: Record<string, unknown>) => {
    let colorAttributeValueId: number | null = null;
    let colorName: string | null = null;
    let sizeAttributeValueId: number | null = null;
    let sizeName: string | null = null;
    const hasVariantImage = !!v.image_variant_512;

    for (const ptavId of (v.product_template_attribute_value_ids as number[] ?? [])) {
      const ptav = ptavMap.get(ptavId);
      if (!ptav) continue;
      if (isColorAttribute(ptav.attrName)) {
        colorAttributeValueId = ptav.valueId;
        colorName = ptav.valueName;
      } else if (isSizeAttribute(ptav.attrName, [ptav.valueName])) {
        sizeAttributeValueId = ptav.valueId;
        sizeName = ptav.valueName;
      }
    }

    const imageUrl: string | null = hasVariantImage
      ? `data:image/jpeg;base64,${v.image_variant_512 as string}`
      : typeof tmpl.image_512 === "string" && tmpl.image_512
        ? `data:image/jpeg;base64,${tmpl.image_512}`
        : null;

    return {
      id: v.id as number,
      colorAttributeValueId,
      colorName,
      sizeAttributeValueId,
      sizeName,
      imageUrl,
    };
  });

  // Build descriptive attributes (exclude Color and Talle)
  const descriptiveAttributes: Array<{ label: string; value: string }> = [];

  // Collect all value ids from descriptive attr lines
  const descriptiveAttrValueIds = new Set<number>();
  const descriptiveAttrLines: Array<{ attrName: string; valueIds: number[] }> = [];

  for (const line of attrLinesRaw) {
    const attrName: string = Array.isArray(line.attribute_id) ? line.attribute_id[1] : "";
    if (isColorAttribute(attrName)) continue;
    const valueIds: number[] = line.value_ids ?? [];
    // Check if it's a size attr by fetching some values — heuristic: skip if name matches size
    if (isSizeAttribute(attrName, [])) continue;
    descriptiveAttrLines.push({ attrName, valueIds });
    for (const vid of valueIds) descriptiveAttrValueIds.add(vid);
  }

  if (descriptiveAttrValueIds.size > 0) {
    const attrValues = await odoo.read(
      "product.attribute.value",
      Array.from(descriptiveAttrValueIds),
      ["id", "name"],
    );
    const attrValueMap = new Map<number, string>(attrValues.map((av: { id: number; name: string }) => [av.id, av.name]));

    for (const line of descriptiveAttrLines) {
      const valueNames = line.valueIds
        .map((id) => attrValueMap.get(id))
        .filter((n): n is string => !!n);
      if (valueNames.length > 0) {
        descriptiveAttributes.push({
          label: line.attrName,
          value: valueNames.join(", "),
        });
      }
    }
  }

  return {
    templateId: tmpl.id,
    name: tmpl.name,
    ref: tmpl.default_code || null,
    listPrice: typeof tmpl.list_price === "number" ? tmpl.list_price : null,
    categoryId: Array.isArray(tmpl.categ_id) ? (tmpl.categ_id[0] ?? null) : null,
    variants,
    attributes: descriptiveAttributes,
  };
}

export async function searchProductTemplates(q: string): Promise<Array<{
  templateId: number;
  name: string;
  ref: string | null;
  defaultCode: string | null;
}>> {
  if (!q || q.trim().length < 2) return [];

  const results = await odoo.searchRead(
    "product.template",
    [
      "&",
      ["active", "=", true],
      "|",
      "|",
      ["name", "ilike", q.trim()],
      ["default_code", "ilike", q.trim()],
      ["product_variant_ids.barcode", "ilike", q.trim()],
    ],
    ["id", "name", "default_code"],
    { limit: 20, order: "name asc" },
  );

  return results.map((r: { id: number; name: string; default_code: string | false }) => ({
    templateId: r.id,
    name: r.name,
    ref: r.default_code || null,
    defaultCode: r.default_code || null,
  }));
}
