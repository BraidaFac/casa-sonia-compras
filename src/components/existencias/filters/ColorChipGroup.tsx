"use client";

interface ColorOption {
  colorBase: string;
  name: string;
  hexColor: string;
}

interface ColorChipGroupProps {
  colors: ColorOption[];
  selected: string[]; // colorBase values
  onChange: (bases: string[]) => void;
  showLabel?: boolean;
}

export function ColorChipGroup({ colors, selected, onChange, showLabel = true }: ColorChipGroupProps) {
  if (colors.length === 0) return null;

  function toggle(base: string) {
    onChange(
      selected.includes(base) ? selected.filter((x) => x !== base) : [...selected, base],
    );
  }

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
          Color
        </span>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {colors.map((color) => {
          const active = selected.includes(color.colorBase);
          const hasHex = color.hexColor && color.hexColor.startsWith("#");
          return (
            <button
              key={color.colorBase}
              onClick={() => toggle(color.colorBase)}
              title={color.name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px 4px 6px",
                borderRadius: 20,
                border: `1px solid ${active ? "var(--mantine-color-amber-6)" : "var(--border)"}`,
                background: active
                  ? "color-mix(in srgb, var(--mantine-color-amber-6) 18%, transparent)"
                  : "var(--surface)",
                color: active ? "var(--mantine-color-amber-4)" : "var(--text2)",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                fontWeight: active ? 600 : 400,
                fontSize: 13,
                lineHeight: 1.4,
                transition: "all 100ms",
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: hasHex ? color.hexColor : "var(--bg)",
                  border: `1px solid ${hasHex ? "transparent" : "var(--border)"}`,
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)",
                }}
              />
              {color.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
