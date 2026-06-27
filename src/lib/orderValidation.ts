import type { LocalArticle } from "@/types";

export interface ValidationResult {
  valid: boolean;
  missing: string[];   // human-readable list of missing fields
}

interface OrderData {
  supplierId: number | null;
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
  if (!order.date) missing.push("Fecha no seleccionada");
  if (order.articles.length === 0) missing.push("Sin artículos");

  for (const article of order.articles) {
    const label = article.name || "(artículo sin nombre)";
    if (!article.category) missing.push(`"${label}": falta categoría`);
    if (!article.sizeAttributeId) missing.push(`"${label}": falta tipo de talle`);
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Strict validation for confirm — must pass 100% or confirm is blocked.
 */
export function validateForConfirm(order: OrderData): ValidationResult {
  const base = validateForDraft(order);
  const missing = [...base.missing];

  for (const article of order.articles) {
    const label = article.name || "(artículo sin nombre)";

    if (!article.name) missing.push(`Artículo sin nombre`);

    const hasQty = article.rows.some((row) =>
      article.sizes.some((size) => parseInt(row.quantities[size.name] || "0") > 0),
    );
    if (!hasQty) missing.push(`"${label}": sin cantidades cargadas`);

    for (const row of article.rows) {
      if (!row.color) continue;
      if (row.color.isNew) {
        if (!row.color.colorBase)
          missing.push(`"${label}" color "${row.color.name}": falta Color Base`);
        if (!row.color.hexColor)
          missing.push(`"${label}" color "${row.color.name}": falta color HEX`);
      }
    }
  }

  return { valid: missing.length === 0, missing };
}
