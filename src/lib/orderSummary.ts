import type { Article } from "@/types";

export interface CategorySummary {
  categoryName: string;
  canonicalSizes: string[]; // ordered by first appearance
  quantityBySize: Record<string, number>; // canonical → total units
  totalUnits: number;
  totalCost: number; // sum of (price × units) per article
  avgCost: number; // totalCost / totalUnits, 0 if totalUnits === 0
}

export function computeOrderSummary(articles: Article[]): CategorySummary[] {
  // categoryName → accumulator
  const map = new Map<
    string,
    {
      canonicalOrder: string[]; // insertion-order canonical sizes
      seenCanonicals: Set<string>;
      quantityBySize: Record<string, number>;
      totalUnits: number;
      totalCost: number;
    }
  >();

  for (const article of articles) {
    const categoryName = article.category?.name ?? "Sin categoría";
    const price = parseFloat(article.price || "0");
    const articlePrice = isNaN(price) ? 0 : price;

    if (!map.has(categoryName)) {
      map.set(categoryName, {
        canonicalOrder: [],
        seenCanonicals: new Set(),
        quantityBySize: {},
        totalUnits: 0,
        totalCost: 0,
      });
    }
    const acc = map.get(categoryName)!;

    // Build a canonical map for this article's sizes: sizeName → canonical
    const sizeToCanonical = new Map<string, string>();
    for (const size of article.sizes) {
      const canonical = size.equivalencia || size.name;
      sizeToCanonical.set(size.name, canonical);
      if (!acc.seenCanonicals.has(canonical)) {
        acc.seenCanonicals.add(canonical);
        acc.canonicalOrder.push(canonical);
      }
    }

    let articleUnits = 0;

    for (const row of article.rows) {
      for (const size of article.sizes) {
        const canonical = sizeToCanonical.get(size.name)!;

        // Sum warehouseQuantities keys ending in `:${size.name}`
        let qty = 0;
        const suffix = `:${size.name}`;
        let hasWarehouseQty = false;
        for (const [key, val] of Object.entries(row.warehouseQuantities)) {
          if (key.endsWith(suffix)) {
            hasWarehouseQty = true;
            const n = parseFloat(val);
            if (!isNaN(n)) qty += n;
          }
        }
        // Only read plain quantities in no-warehouse mode
        if (!hasWarehouseQty) {
          const plain = parseFloat(row.quantities[size.name] || "0");
          if (!isNaN(plain)) qty += plain;
        }

        if (qty > 0) {
          acc.quantityBySize[canonical] =
            (acc.quantityBySize[canonical] ?? 0) + qty;
          articleUnits += qty;
        }
      }
    }

    acc.totalUnits += articleUnits;
    acc.totalCost += articlePrice * articleUnits;
  }

  const result: CategorySummary[] = [];
  for (const [categoryName, acc] of map) {
    result.push({
      categoryName,
      canonicalSizes: acc.canonicalOrder,
      quantityBySize: acc.quantityBySize,
      totalUnits: acc.totalUnits,
      totalCost: acc.totalCost,
      avgCost: acc.totalUnits > 0 ? acc.totalCost / acc.totalUnits : 0,
    });
  }

  result.sort((a, b) => a.categoryName.localeCompare(b.categoryName, "es"));
  return result;
}
