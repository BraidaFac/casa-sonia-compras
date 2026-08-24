import type { LocalArticle } from "@/types";

export interface ValidationResult {
  valid: boolean;
  missing: string[]; // human-readable list of missing fields
}

interface OrderData {
  supplierId: number | null;
  brandId?: number | null;
  compradoraIds?: number[];
  date: string | null;
  articles: LocalArticle[];
}

/**
 * Draft validation — permissive. Returns list of missing fields for UI warning modal.
 * An empty missing[] means the order is complete.
 */
export function validateForDraft(order: OrderData): ValidationResult {
  const missing: string[] = [];

  if (!order.supplierId) missing.push("Proveedor no seleccionado");
  if (!order.brandId) missing.push("Marca no seleccionada");
  if (!order.date) missing.push("Fecha no seleccionada");
  if (order.articles.length === 0) missing.push("Sin artículos");

  return { valid: missing.length === 0, missing };
}

/**
 * Strict validation for confirm — must pass 100% or confirm is blocked.
 */
export function validateForConfirm(order: OrderData): ValidationResult {
  const base = validateForDraft(order);
  const missing = [...base.missing];

  if (!order.compradoraIds?.length) missing.push("Comprador no seleccionado");

  for (const article of order.articles) {
    const label = article.name || "(artículo sin nombre)";

    if (!article.name) missing.push(`Artículo sin nombre`);

    if (!article.category) missing.push(`"${label}": sin categoría`);

    const hasMarca = article.attributes.some(
      (attr) =>
        attr.attributeName.toLowerCase().includes("marca") &&
        attr.values.length > 0,
    );
    if (!hasMarca) missing.push(`"${label}": sin atributo Marca`);

    const hasQty = article.rows.some((row) => {
      const normal = article.sizes.some(
        (size) => parseInt(row.quantities[size.name] || "0") > 0,
      );
      const warehouse = Object.values(row.warehouseQuantities || {}).some(
        (v) => parseInt(v || "0") > 0,
      );
      return normal || warehouse;
    });
    if (!hasQty) missing.push(`"${label}": sin cantidades cargadas`);

    if (article.referenciaExistsInOdoo) {
      missing.push(`"${label}": el código "${article.referencia}" ya existe en Odoo`);
    }
  }

  return { valid: missing.length === 0, missing };
}
