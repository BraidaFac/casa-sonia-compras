"use client";
import { Text, Skeleton } from "@mantine/core";
import type { ExistenciasProduct } from "@/types";
import { useConfigVigente } from "@/hooks/useConfigVigente";
import { useCategoriasFlat } from "@/hooks/useCategoriasFlat";
import { resolverTodos, BandaDescuentosPromos } from "./PreciosCalculados";

interface ArticleHeaderProps {
  product: ExistenciasProduct;
  selectedColorValueId: number | null;
  loading?: boolean;
}

function fmtPrecio(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ArticleHeader({ product, selectedColorValueId, loading }: ArticleHeaderProps) {
  const { data: configVigente } = useConfigVigente();
  const { data: categorias = [] } = useCategoriasFlat();

  const selectedVariant =
    product.variants.find((v) => v.colorAttributeValueId === selectedColorValueId) ??
    product.variants[0] ??
    null;

  const imageUrl = selectedVariant?.imageUrl ?? null;

  // Calcular precios por cada medio de pago con descuento
  const descuentosResueltos =
    product.listPrice !== null && configVigente
      ? resolverTodos(product.listPrice, product.categoryId, configVigente.descuentos, categorias)
      : [];

  const hasPromosOrDescuentos =
    product.listPrice !== null &&
    configVigente &&
    (configVigente.descuentos.length > 0 || configVigente.promos.hoy.length > 0);

  return (
    <div style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
      {/* ── Fila principal ── */}
      <div
        style={{
          display: "flex",
          gap: 16,
          padding: "14px 20px 12px",
          alignItems: "flex-start",
        }}
      >
        {/* Foto */}
        <div
          style={{
            width: 88,
            height: 106,
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
            <Skeleton width={88} height={106} />
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={product.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Text size="xs" c="dimmed" ta="center" px={4}>
              Sin foto
            </Text>
          )}
        </div>

        {/* Info: nombre + ref + atributos + precios */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0 }}>
          {loading ? (
            <>
              <Skeleton height={20} width="65%" mb={6} />
              <Skeleton height={12} width="35%" mb={10} />
              <Skeleton height={14} width="80%" mb={12} />
              <div style={{ display: "flex", gap: 10 }}>
                <Skeleton height={58} width={140} radius={8} />
                <Skeleton height={58} width={140} radius={8} />
              </div>
            </>
          ) : (
            <>
              {/* Nombre */}
              <Text
                fw={700}
                size="md"
                style={{ fontFamily: "var(--font-display)", lineHeight: 1.25, wordBreak: "break-word" }}
              >
                {product.name}
              </Text>

              {/* Referencia */}
              {product.ref && (
                <Text size="xs" c="dimmed" style={{ lineHeight: 1, marginTop: 2 }}>
                  {product.ref}
                </Text>
              )}

              {/* Atributos descriptivos */}
              {product.attributes.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 7 }}>
                  {product.attributes.map((attr) => (
                    <div
                      key={attr.label}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 7px",
                        borderRadius: 4,
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--text3)",
                        }}
                      >
                        {attr.label}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text1)" }}>
                        {attr.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Precios ── */}
              {product.listPrice !== null && (
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {/* TARJETA — siempre visible */}
                  <div
                    style={{
                      padding: "5px 10px",
                      borderRadius: 7,
                      width: 120,
                      flexShrink: 0,
                      background: "color-mix(in srgb, var(--mantine-color-indigo-6) 12%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--mantine-color-indigo-6) 35%, transparent)",
                    }}
                  >
                    <Text c="dimmed" fw={600} style={{ lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 8 }}>
                      Precio tarjeta
                    </Text>
                    <Text fw={700} size="md" c="var(--mantine-color-indigo-4)" style={{ lineHeight: 1.2, fontFamily: "var(--font-display)", marginTop: 2 }}>
                      ${fmtPrecio(product.listPrice)}
                    </Text>
                  </div>

                  {/* Un box por cada medio de pago con descuento vigente */}
                  {descuentosResueltos.map((d) => (
                    <div
                      key={d.medioPagoId}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 7,
                        width: 120,
                        flexShrink: 0,
                        background: "color-mix(in srgb, var(--mantine-color-green-6) 14%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--mantine-color-green-6) 40%, transparent)",
                      }}
                    >
                      <Text c="dimmed" fw={600} style={{ lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 8 }}>
                        {d.nombre}
                      </Text>
                      <Text fw={700} size="md" c="var(--mantine-color-green-4)" style={{ lineHeight: 1.2, fontFamily: "var(--font-display)", marginTop: 2 }}>
                        ${fmtPrecio(d.precio)}
                      </Text>
                      <Text size="10px" c="var(--mantine-color-green-5)" fw={600} style={{ lineHeight: 1, marginTop: 3 }}>
                        {d.label}
                      </Text>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Banda de descuentos y promos ── */}
      {!loading && hasPromosOrDescuentos && (
        <BandaDescuentosPromos
          listPrice={product.listPrice!}
          categoryId={product.categoryId}
          descuentos={configVigente!.descuentos}
          promosHoy={configVigente!.promos.hoy}
          categorias={categorias}
        />
      )}
    </div>
  );
}
