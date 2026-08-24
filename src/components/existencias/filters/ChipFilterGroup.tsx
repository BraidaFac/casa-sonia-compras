"use client";
import { useState } from "react";

interface Option {
  id: number;
  name: string;
}

interface ChipFilterGroupProps {
  label: string;
  options: Option[];
  selected: number[];
  onChange: (ids: number[]) => void;
  showLabel?: boolean;
  searchable?: boolean;
}

export function ChipFilterGroup({
  label,
  options,
  selected,
  onChange,
  showLabel = true,
  searchable = false,
}: ChipFilterGroupProps) {
  const [query, setQuery] = useState("");

  if (options.length === 0) return null;

  function toggle(id: number) {
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );
  }

  const visible = searchable && query.trim()
    ? options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
    : options;

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
          {label}
        </span>
      )}
      {searchable && (
        <input
          type="text"
          placeholder="Buscar marca…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            marginBottom: 8,
            padding: "5px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text1)",
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {visible.map((opt) => {
          const active = selected.includes(opt.id);
          return (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              style={{
                padding: "4px 12px",
                borderRadius: 20,
                border: `1px solid ${
                  active
                    ? "var(--mantine-color-amber-6)"
                    : "var(--border)"
                }`,
                background: active
                  ? "color-mix(in srgb, var(--mantine-color-amber-6) 18%, transparent)"
                  : "var(--surface)",
                color: active
                  ? "var(--mantine-color-amber-4)"
                  : "var(--text2)",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                fontWeight: active ? 600 : 400,
                fontSize: 13,
                lineHeight: 1.4,
                transition: "all 100ms",
              }}
            >
              {opt.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
