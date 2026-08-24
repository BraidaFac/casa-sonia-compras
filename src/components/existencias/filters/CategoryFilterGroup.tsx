"use client";
import { CategoryPicker } from "@/components/inventario/CategoryPicker";

interface CategoryFilterGroupProps {
  selected: number[];
  onChange: (ids: number[]) => void;
  showLabel?: boolean;
}

export function CategoryFilterGroup({ selected, onChange, showLabel = true }: CategoryFilterGroupProps) {
  return (
    <div style={{ marginBottom: showLabel ? 20 : 4 }}>
      {showLabel && (
        <span
          style={{
            display: "block",
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text3)",
            fontFamily: "var(--font-sans)",
            marginBottom: 8,
          }}
        >
          Categoría
        </span>
      )}
      <CategoryPicker value={selected} onChange={onChange} />
    </div>
  );
}
