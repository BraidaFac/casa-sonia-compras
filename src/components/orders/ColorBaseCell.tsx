import { Select } from "@mantine/core";
import type { ColorValue } from "@/types";

interface Props {
  color: ColorValue | null;
  colorBaseOptions: string[];
  onChange: (color: ColorValue) => void;
}

export function ColorBaseCell({ color, colorBaseOptions, onChange }: Props) {
  if (!color) {
    return (
      <div style={{ padding: "4px 8px", fontSize: 12, color: "var(--text3)", fontStyle: "italic" }}>
        —
      </div>
    );
  }

  if (color.isNew) {
    return (
      <Select
        placeholder="Color base..."
        size="xs"
        data={colorBaseOptions}
        value={color.colorBase || null}
        onChange={(val) => {
          if (val) onChange({ ...color, colorBase: val });
        }}
        searchable
        error={!color.colorBase}
        styles={{
          input: { fontSize: 11, background: "transparent" },
          wrapper: { padding: "2px 4px" },
          dropdown: { minWidth: 200 },
        }}
      />
    );
  }

  return (
    <div
      style={{
        padding: "4px 8px",
        fontSize: 12,
        color: color.colorBase ? "var(--text2)" : "var(--text3)",
        fontStyle: color.colorBase ? "normal" : "italic",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {color.colorBase || "—"}
    </div>
  );
}
