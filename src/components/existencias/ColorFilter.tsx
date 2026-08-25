"use client";
import type { ExistenciasVariant } from "@/types";

interface ColorFilterProps {
  variants: ExistenciasVariant[];
  selectedColorValueId: number | null;
  onChange: (colorValueId: number | null) => void;
}

export function ColorFilter({ variants, selectedColorValueId, onChange }: ColorFilterProps) {
  // Get unique colors sorted alphabetically
  const colors = variants
    .filter((v) => v.colorAttributeValueId !== null && v.colorName !== null)
    .reduce<Array<{ id: number; name: string }>>((acc, v) => {
      if (!acc.find((c) => c.id === v.colorAttributeValueId)) {
        acc.push({ id: v.colorAttributeValueId!, name: v.colorName! });
      }
      return acc;
    }, [])
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  if (colors.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: "12px 24px",
        flexWrap: "wrap",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {colors.map((color) => {
        const isSelected = color.id === selectedColorValueId;
        return (
          <button
            key={color.id}
            onClick={() => onChange(color.id)}
            style={{
              padding: "4px 14px",
              borderRadius: 20,
              border: `1px solid ${isSelected ? "var(--mantine-color-amber-6)" : "var(--border)"}`,
              background: isSelected
                ? "color-mix(in srgb, var(--mantine-color-amber-6) 20%, transparent)"
                : "var(--surface)",
              color: isSelected ? "var(--mantine-color-amber-4)" : "var(--text2)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontWeight: isSelected ? 600 : 400,
              fontSize: 13,
              transition: "all 100ms",
            }}
          >
            {color.name}
          </button>
        );
      })}
    </div>
  );
}
