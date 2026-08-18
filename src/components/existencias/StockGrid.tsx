"use client";
import { Text } from "@mantine/core";
import { LETTER_SIZES } from "@/lib/sizes";
import type { ExistenciasVariant, ExistenciasLocation, ExistenciasStockCell } from "@/types";

interface StockGridProps {
  variants: ExistenciasVariant[];
  locations: ExistenciasLocation[];
  stock: ExistenciasStockCell[];
  selectedColorValueId: number | null;
  highlightedVariantId: number | null;
}

const LETTER_ORDER = new Map(LETTER_SIZES.map((s, i) => [s.toLowerCase(), i]));

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const aNum = Number(a);
    const bNum = Number(b);
    const aLetter = LETTER_ORDER.get(a.toLowerCase()) ?? -1;
    const bLetter = LETTER_ORDER.get(b.toLowerCase()) ?? -1;
    // Both numeric
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    // Both letter
    if (aLetter >= 0 && bLetter >= 0) return aLetter - bLetter;
    // Numeric before letter
    if (!isNaN(aNum) && aLetter < 0) return -1;
    if (!isNaN(bNum) && bLetter < 0) return 1;
    return a.localeCompare(b);
  });
}

// Build stock lookup: variantId → locationId → qty
function buildStockMap(stock: ExistenciasStockCell[]) {
  const map = new Map<number, Map<number, number>>();
  for (const cell of stock) {
    if (!map.has(cell.variantId)) map.set(cell.variantId, new Map());
    map.get(cell.variantId)!.set(cell.locationId, cell.qty);
  }
  return map;
}

export function StockGrid({
  variants,
  locations,
  stock,
  selectedColorValueId,
  highlightedVariantId,
}: StockGridProps) {
  // Filter variants by selected color (or all if no color attr)
  const hasColors = variants.some((v) => v.colorAttributeValueId !== null);
  const filteredVariants = hasColors
    ? variants.filter((v) => v.colorAttributeValueId === selectedColorValueId)
    : variants;

  // Get unique sizes from filtered variants
  const rawSizes = [
    ...new Set(filteredVariants.map((v) => v.sizeName).filter((s): s is string => !!s)),
  ];
  const hasSizes = rawSizes.length > 0;
  const sizes = hasSizes ? sortSizes(rawSizes) : ["—"];

  // Build variant lookup: sizeName → variant
  const sizeToVariant = new Map<string, ExistenciasVariant>(
    filteredVariants.map((v) => [v.sizeName ?? "—", v])
  );

  const stockMap = buildStockMap(stock);

  // Group locations by warehouse; fall back to completeName as label if no warehouse matched
  interface WarehouseRow {
    key: string;
    label: string;
    locationIds: number[];
  }
  const warehouseRows: WarehouseRow[] = [];
  const seenKeys = new Set<string>();
  for (const loc of locations) {
    const key = loc.warehouseId ? `wh-${loc.warehouseId}` : `loc-${loc.id}`;
    const label = loc.warehouseName ?? loc.completeName;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      warehouseRows.push({ key, label, locationIds: [loc.id] });
    } else {
      warehouseRows.find((r) => r.key === key)!.locationIds.push(loc.id);
    }
  }

  if (filteredVariants.length === 0 && warehouseRows.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <Text c="dimmed" size="sm">
          Sin datos de stock
        </Text>
      </div>
    );
  }

  const headerBg = "var(--surface)";
  const borderColor = "var(--border)";
  const cellMinW = 56;

  function getCellStyle(
    qty: number | null,
    isHighlighted: boolean
  ): React.CSSProperties {
    if (qty === null) {
      return {
        background: "color-mix(in srgb, var(--bg) 60%, transparent)",
        color: "var(--text3)",
        opacity: 0.4,
      };
    }
    if (isHighlighted) {
      return {
        background: "color-mix(in srgb, var(--mantine-color-amber-6) 25%, transparent)",
        color: "var(--mantine-color-amber-3)",
        fontWeight: 700,
        outline: `2px solid var(--mantine-color-amber-6)`,
        outlineOffset: -2,
      };
    }
    if (qty > 0) {
      return {
        background: "color-mix(in srgb, var(--mantine-color-green-9) 15%, transparent)",
        color: "var(--mantine-color-green-4)",
        fontWeight: 600,
      };
    }
    return {
      background: "transparent",
      color: "var(--text3)",
    };
  }

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 320px)" }}>
      <table style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: 13 }}>
        <thead>
          <tr
            style={{
              background: headerBg,
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          >
            <th
              style={{
                padding: "8px 16px",
                textAlign: "left",
                borderBottom: `1px solid ${borderColor}`,
                fontWeight: 600,
                color: "var(--text2)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                minWidth: 140,
                position: "sticky",
                left: 0,
                background: headerBg,
                zIndex: 2,
              }}
            >
              Depósito
            </th>
            {sizes.map((size) => (
              <th
                key={size}
                style={{
                  padding: "8px 8px",
                  textAlign: "center",
                  borderBottom: `1px solid ${borderColor}`,
                  fontWeight: 600,
                  color: "var(--text2)",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  minWidth: cellMinW,
                }}
              >
                {size}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {warehouseRows.map((row, rowIdx) => (
            <tr
              key={row.key}
              style={{
                background:
                  rowIdx % 2 === 0
                    ? "transparent"
                    : "color-mix(in srgb, var(--surface) 40%, transparent)",
              }}
            >
              <td
                style={{
                  padding: "7px 16px",
                  borderBottom: `1px solid ${borderColor}`,
                  color: "var(--text1)",
                  fontWeight: 500,
                  position: "sticky",
                  left: 0,
                  background: rowIdx % 2 === 0 ? "var(--bg)" : "var(--surface)",
                  zIndex: 1,
                }}
              >
                {row.label}
              </td>
              {sizes.map((size) => {
                const variant = sizeToVariant.get(size);
                if (!variant) {
                  return (
                    <td
                      key={size}
                      style={{
                        padding: "7px 8px",
                        borderBottom: `1px solid ${borderColor}`,
                        textAlign: "center",
                        ...getCellStyle(null, false),
                      }}
                    >
                      –
                    </td>
                  );
                }
                // Aggregate qty across all locations in this warehouse row
                const qtyMap = stockMap.get(variant.id);
                const qty = row.locationIds.reduce(
                  (sum, locId) => sum + (qtyMap?.get(locId) ?? 0),
                  0
                );
                const isHighlighted = highlightedVariantId === variant.id;
                return (
                  <td
                    key={size}
                    style={{
                      padding: "7px 8px",
                      borderBottom: `1px solid ${borderColor}`,
                      textAlign: "center",
                      ...getCellStyle(qty, isHighlighted),
                    }}
                  >
                    {qty}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
