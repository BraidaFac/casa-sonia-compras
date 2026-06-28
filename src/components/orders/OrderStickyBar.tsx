"use client";
import { Badge, Group, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { Article, Supplier } from "@/types";

function getBrandFromArticles(articles: Article[]): string | null {
  for (const a of articles) {
    const brandAttr = a.attributes.find((attr) =>
      attr.attributeName.toLowerCase().includes("marca"),
    );
    if (brandAttr?.values[0]?.name) return brandAttr.values[0].name;
  }
  return null;
}

interface Props {
  title: string;
  supplier: Supplier | null;
  articles: Article[];
  totalUnits: number;
  totalAmount: number;
}

const SEP = (
  <div
    style={{
      width: 1,
      height: 14,
      background: "var(--mantine-color-dark-4)",
      flexShrink: 0,
    }}
  />
);

export function OrderStickyBar({
  title,
  supplier,
  articles,
  totalUnits,
  totalAmount,
}: Props) {
  const brand = getBrandFromArticles(articles);
  const isMobile = useMediaQuery("(max-width: 639px)");

  return (
    <div
      className="sticky-bar-pad"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 25,
        background: "var(--mantine-color-dark-8)",
        borderBottom: "1px solid var(--mantine-color-dark-5)",
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 8 : 12,
        flexWrap: "nowrap",
        overflow: "hidden",
      }}
    >
      <Text
        size="xs"
        c="dimmed"
        style={{ whiteSpace: "nowrap", flexShrink: 0 }}
      >
        {title}
      </Text>

      {!isMobile && (supplier || brand) && SEP}

      {supplier && (
        <Group
          gap={5}
          align="center"
          style={{ flexShrink: 1, minWidth: 0, overflow: "hidden" }}
        >
          {!isMobile && (
            <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
              Proveedor
            </Text>
          )}
          <Text
            size="xs"
            fw={600}
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {supplier.name}
          </Text>
        </Group>
      )}

      {!isMobile && supplier && brand && SEP}

      {!isMobile && brand && (
        <Group gap={5} align="center" style={{ flexShrink: 0 }}>
          <Text size="xs" c="dimmed">
            Marca
          </Text>
          <Text size="xs" fw={600}>
            {brand}
          </Text>
        </Group>
      )}

      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {totalUnits > 0 && (
          <Badge color="amber" variant="light" size="sm">
            {totalUnits} u.
          </Badge>
        )}
        {totalAmount > 0 && !isMobile && (
          <Badge color="amber" variant="outline" size="sm">
            $
            {totalAmount.toLocaleString("es-AR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Badge>
        )}
      </div>
    </div>
  );
}
