"use client";
import { Text, Skeleton } from "@mantine/core";
import type { ExistenciasProduct } from "@/types";

interface ArticleHeaderProps {
  product: ExistenciasProduct;
  selectedColorValueId: number | null;
  loading?: boolean;
}

export function ArticleHeader({ product, selectedColorValueId, loading }: ArticleHeaderProps) {
  // Find variant for the selected color to get the image
  const selectedVariant =
    product.variants.find((v) => v.colorAttributeValueId === selectedColorValueId) ??
    product.variants[0] ??
    null;

  const imageUrl = selectedVariant?.imageUrl ?? null;

  function formatPrice(p: number | null) {
    if (p === null) return null;
    return p.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 20,
        padding: "16px 24px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Foto */}
      <div
        style={{
          width: 100,
          height: 120,
          flexShrink: 0,
          borderRadius: 8,
          overflow: "hidden",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading ? (
          <Skeleton width={100} height={120} />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Text size="xs" c="dimmed">
            Sin foto
          </Text>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {loading ? (
          <>
            <Skeleton height={20} width="60%" mb={8} />
            <Skeleton height={32} width={120} mb={12} />
            <Skeleton height={12} width="80%" mb={4} />
            <Skeleton height={12} width="60%" />
          </>
        ) : (
          <>
            {/* Nombre + ref */}
            <Text
              fw={700}
              size="lg"
              style={{
                fontFamily: "var(--font-display)",
                lineHeight: 1.2,
                wordBreak: "break-word",
              }}
            >
              {product.name}
            </Text>
            {product.ref && (
              <Text size="xs" c="dimmed" mb={8}>
                {product.ref}
              </Text>
            )}

            {/* Precio — prominente */}
            {product.listPrice !== null && (
              <div
                style={{
                  margin: "8px 0 12px",
                  display: "inline-block",
                  padding: "4px 12px",
                  background:
                    "color-mix(in srgb, var(--mantine-color-amber-6) 15%, transparent)",
                  border:
                    "1px solid color-mix(in srgb, var(--mantine-color-amber-6) 30%, transparent)",
                  borderRadius: 6,
                }}
              >
                <Text size="xs" c="dimmed" style={{ lineHeight: 1 }}>
                  Precio de venta
                </Text>
                <Text
                  fw={700}
                  size="xl"
                  c="var(--mantine-color-amber-4)"
                  style={{ lineHeight: 1.2, fontFamily: "var(--font-display)" }}
                >
                  ${formatPrice(product.listPrice)}
                </Text>
              </div>
            )}

            {/* Atributos descriptivos */}
            {product.attributes.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {product.attributes.map((attr) => (
                  <div
                    key={attr.label}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 8px",
                      borderRadius: 4,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--text3)",
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      {attr.label}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--text1)",
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      {attr.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
