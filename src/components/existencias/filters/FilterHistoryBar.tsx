"use client";
import { X } from "lucide-react";
import type { FilterHistoryEntry } from "@/types";

interface FilterHistoryBarProps {
  history: FilterHistoryEntry[];
  onApply: (entry: FilterHistoryEntry) => void;
  onRemove: (id: string) => void;
}

export function FilterHistoryBar({
  history,
  onApply,
  onRemove,
}: FilterHistoryBarProps) {
  if (history.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
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
        Búsquedas recientes
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {history.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <button
              onClick={() => onApply(entry)}
              style={{
                flex: 1,
                textAlign: "left",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text2)",
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                lineHeight: 1.4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                padding: 0,
              }}
              title={entry.label}
            >
              {entry.label}
            </button>
            <button
              onClick={() => onRemove(entry.id)}
              aria-label="Eliminar búsqueda"
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                borderRadius: 4,
                border: "none",
                background: "none",
                cursor: "pointer",
                color: "var(--text3)",
                padding: 0,
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
