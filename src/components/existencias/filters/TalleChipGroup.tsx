"use client";

interface TalleChipGroupProps {
  talles: { equivalencia: string }[];
  selected: string[];
  onChange: (equivalencias: string[]) => void;
  showLabel?: boolean;
}

export function TalleChipGroup({ talles, selected, onChange, showLabel = true }: TalleChipGroupProps) {
  if (talles.length === 0) return null;

  function toggle(eq: string) {
    onChange(
      selected.includes(eq) ? selected.filter((x) => x !== eq) : [...selected, eq],
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
          Talle
        </span>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {talles.map(({ equivalencia }) => {
          const active = selected.includes(equivalencia);
          return (
            <button
              key={equivalencia}
              onClick={() => toggle(equivalencia)}
              style={{
                minWidth: 40,
                padding: "4px 10px",
                borderRadius: 20,
                border: `1px solid ${
                  active ? "var(--mantine-color-amber-6)" : "var(--border)"
                }`,
                background: active
                  ? "color-mix(in srgb, var(--mantine-color-amber-6) 18%, transparent)"
                  : "var(--surface)",
                color: active ? "var(--mantine-color-amber-4)" : "var(--text2)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontWeight: active ? 700 : 400,
                fontSize: 12,
                lineHeight: 1.4,
                textAlign: "center",
                transition: "all 100ms",
              }}
            >
              {equivalencia}
            </button>
          );
        })}
      </div>
    </div>
  );
}
