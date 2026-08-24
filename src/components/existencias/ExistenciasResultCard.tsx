"use client";
import { Skeleton, Text } from "@mantine/core";
import type { ExistenciasTemplateCard } from "@/types";

interface ExistenciasResultCardProps {
  item: ExistenciasTemplateCard;
  onClick: (id: number) => void;
}

export function ExistenciasResultCard({ item, onClick }: ExistenciasResultCardProps) {
  return (
    <button
      onClick={() => onClick(item.id)}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        textAlign: "left",
        padding: 0,
        transition: "border-color 120ms",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "var(--mantine-color-amber-6)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {item.thumbUrl ? (
          <img
            src={item.thumbUrl}
            alt={item.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Text size="xs" c="dimmed">
            Sin foto
          </Text>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "8px 10px 10px" }}>
        <Text
          size="xs"
          fw={600}
          lineClamp={2}
          style={{
            fontFamily: "var(--font-sans)",
            lineHeight: 1.3,
            color: "var(--text1)",
          }}
        >
          {item.name}
        </Text>
        {item.defaultCode && (
          <Text
            size="xs"
            c="dimmed"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, marginTop: 2 }}
          >
            {item.defaultCode}
          </Text>
        )}
        {item.brand && (
          <Text
            size="xs"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 11,
              color: "var(--mantine-color-amber-4)",
              marginTop: 2,
              fontWeight: 500,
            }}
          >
            {item.brand}
          </Text>
        )}
      </div>
    </button>
  );
}

export function ExistenciasResultCardSkeleton() {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <Skeleton height={120} radius={0} />
      <div style={{ padding: "8px 10px 10px" }}>
        <Skeleton height={12} mb={4} />
        <Skeleton height={10} width="60%" />
      </div>
    </div>
  );
}
