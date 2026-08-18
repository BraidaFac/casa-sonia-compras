"use client";
import { Text } from "@mantine/core";
import { ScanBarcode } from "lucide-react";
import type { SearchHistoryEntry } from "@/types";

interface EmptyStateProps {
  recentEntries: SearchHistoryEntry[];
  onSelect: (entry: SearchHistoryEntry) => void;
}

export function EmptyState({ recentEntries, onSelect }: EmptyStateProps) {
  if (recentEntries.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px 24px",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background:
              "color-mix(in srgb, var(--mantine-color-amber-6) 10%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--mantine-color-amber-6) 20%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ScanBarcode size={28} color="var(--mantine-color-amber-5)" />
        </div>
        <Text fw={600} size="lg" style={{ fontFamily: "var(--font-display)" }}>
          Consultá el stock
        </Text>
        <Text c="dimmed" size="sm" ta="center">
          Escaneá un código de barras o buscá manualmente un artículo para ver su stock por
          depósito y talle.
        </Text>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px" }}>
      <Text
        size="xs"
        fw={600}
        c="dimmed"
        mb={12}
        style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        Últimas consultas
      </Text>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 10,
        }}
      >
        {recentEntries.slice(0, 5).map((entry) => (
          <button
            key={entry.id}
            onClick={() => onSelect(entry)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              transition: "border-color 100ms, background 100ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--mantine-color-amber-6)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            {entry.thumbUrl ? (
              <img
                src={entry.thumbUrl}
                alt=""
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 4,
                  objectFit: "cover",
                  border: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 4,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text
                size="sm"
                fw={500}
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {entry.productName}
              </Text>
              {entry.productRef && (
                <Text size="xs" c="dimmed">
                  {entry.productRef}
                </Text>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
