"use client";
import { Text } from "@mantine/core";
import {
  resolveDescuento,
  calcularPrecioConDescuento,
  calcularPreciosPromo,
} from "@/lib/configPricing";
import type { DescuentoVigente, PromoVigente, CategoriaFlat } from "@/lib/configPricing";
import { getBankIcon, BANK_ICON_VIEWBOX } from "@/lib/bankIcons";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtLabel(desc: DescuentoVigente): string {
  const val = typeof desc.valor === "string" ? parseFloat(desc.valor) : desc.valor;
  if (desc.tipo === "porcentaje") return `${val}% desc. ${desc.medioPago.nombre}`;
  return `-$${fmt(val)} ${desc.medioPago.nombre}`;
}

export interface DescuentoResuelto {
  medioPagoId: number;
  nombre: string;
  precio: number;
  label: string;
  descuento: DescuentoVigente;
}

/** Resuelve todos los descuentos vigentes para el producto */
export function resolverTodos(
  listPrice: number,
  categoryId: number | null,
  descuentos: DescuentoVigente[],
  categorias: CategoriaFlat[],
): DescuentoResuelto[] {
  const mediosIds = [...new Set(descuentos.map((d) => d.medioPagoId))];
  return mediosIds
    .map((medioId) => {
      const desc = resolveDescuento(medioId, categoryId, descuentos, categorias);
      if (!desc || !desc.medioPago) return null;
      return {
        medioPagoId: medioId,
        nombre: desc.medioPago.nombre,
        precio: calcularPrecioConDescuento(listPrice, desc),
        label: fmtLabel(desc),
        descuento: desc,
      };
    })
    .filter((x): x is DescuentoResuelto => x !== null);
}

/** Elige el "precio efectivo": prioriza nombre con "efectivo/contado", luego el más bajo */
function elegirEfectivo(descuentos: DescuentoResuelto[]): DescuentoResuelto | null {
  if (descuentos.length === 0) return null;
  const keywords = ["efectivo", "contado", "transferencia"];
  const porNombre = descuentos.find((d) =>
    keywords.some((k) => d.nombre.toLowerCase().includes(k)),
  );
  if (porNombre) return porNombre;
  return descuentos.reduce((best, cur) => (cur.precio < best.precio ? cur : best));
}

// ---------------------------------------------------------------------------
// Exportaciones para ArticleHeader
// ---------------------------------------------------------------------------

export interface PrecioEfectivo {
  precio: number;
  label: string | null; // null = sin descuento (igual a tarjeta)
}

export function calcPrecioEfectivo(
  listPrice: number,
  categoryId: number | null,
  descuentos: DescuentoVigente[],
  categorias: CategoriaFlat[],
): PrecioEfectivo {
  const todos = resolverTodos(listPrice, categoryId, descuentos, categorias);
  const efectivo = elegirEfectivo(todos);
  if (!efectivo || efectivo.precio === listPrice) return { precio: listPrice, label: null };
  return { precio: efectivo.precio, label: efectivo.label };
}

// ---------------------------------------------------------------------------
// Banda de descuentos + promos (fila horizontal scrollable)
// ---------------------------------------------------------------------------

interface BandaProps {
  listPrice: number;
  categoryId: number | null;
  descuentos: DescuentoVigente[];
  promosHoy: PromoVigente[];
  categorias: CategoriaFlat[];
}

function ChipsContent({
  todosDesc,
  promosHoy,
  listPrice,
  tieneDescuentos,
  tienePromos,
  keyPrefix,
}: {
  todosDesc: DescuentoResuelto[];
  promosHoy: PromoVigente[];
  listPrice: number;
  tieneDescuentos: boolean;
  tienePromos: boolean;
  keyPrefix: string;
}) {
  const separator = (
    <div
      style={{
        flexShrink: 0,
        width: 1,
        height: 18,
        background: "var(--border)",
        margin: "0 8px",
      }}
    />
  );

  return (
    <>
      {separator}
      {todosDesc.map((d) => (
        <div
          key={`${keyPrefix}-desc-${d.medioPagoId}`}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 9px",
            borderRadius: 20,
            background: "color-mix(in srgb, var(--mantine-color-green-6) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--mantine-color-green-6) 35%, transparent)",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--mantine-color-green-4)", fontWeight: 700 }}>
            🏷
          </span>
          <Text size="xs" c="var(--mantine-color-green-3)" fw={500} style={{ whiteSpace: "nowrap" }}>
            {d.label}
          </Text>
        </div>
      ))}

      {tieneDescuentos && tienePromos && separator}

      {promosHoy.map((promo, idx) => {
        const PROMO_COLORS = ["blue", "violet", "cyan", "grape", "teal", "pink", "orange"];
        const color = PROMO_COLORS[idx % PROMO_COLORS.length];
        const calc = calcularPreciosPromo(listPrice, promo);
        const bancosStr = promo.bancos.filter((b) => b != null).map((b) => b.nombre).join(" · ");
        const banco = promo.marcaTarjeta ? `${bancosStr} · ${promo.marcaTarjeta}` : bancosStr;
        const precioStr =
          calc.tipo === "cuotas"
            ? `${calc.cuotas}x $${fmt(calc.cuotaMonto)}`
            : `$${fmt(calc.precioFinal)}`;

        return (
          <div
            key={`${keyPrefix}-promo-${promo.id}`}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 9px",
              borderRadius: 20,
              background: `color-mix(in srgb, var(--mantine-color-${color}-6) 10%, transparent)`,
              border: `1px solid color-mix(in srgb, var(--mantine-color-${color}-6) 30%, transparent)`,
            }}
          >
            {promo.bancos.filter((b) => b != null).map((b) => {
              const icon = getBankIcon(b.icono);
              if (!icon) return null;
              const sz = Math.round(14 * (icon.scale ?? 1));
              return icon.svgSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={b.id} src={icon.svgSrc} width={sz} height={sz} alt={icon.nombre} style={{ flexShrink: 0, objectFit: "contain" }} />
              ) : (
                <svg
                  key={b.id}
                  viewBox={icon.viewBox ?? BANK_ICON_VIEWBOX}
                  width={14}
                  height={14}
                  fill={`#${icon.color}`}
                  style={{ flexShrink: 0 }}
                  aria-label={icon.nombre}
                >
                  <path d={icon.svgPath} />
                </svg>
              );
            })}
            {promo.bancos.every((b) => !b?.icono) && (
              <span style={{ fontSize: 11 }}>💳</span>
            )}
            <Text size="xs" c={`var(--mantine-color-${color}-3)`} fw={500} style={{ whiteSpace: "nowrap" }}>
              {banco} — {promo.titulo} {precioStr}
            </Text>
          </div>
        );
      })}

    </>
  );
}

export function BandaDescuentosPromos({
  listPrice,
  categoryId,
  descuentos,
  promosHoy,
  categorias,
}: BandaProps) {
  const todosDesc = resolverTodos(listPrice, categoryId, descuentos, categorias);
  const tieneDescuentos = todosDesc.length > 0;
  const tienePromos = promosHoy.length > 0;

  if (!tieneDescuentos && !tienePromos) return null;

  const totalItems = todosDesc.length + promosHoy.length;
  // ~4s por item, mínimo 10s
  const duration = Math.max(10, totalItems * 4);

  return (
    <div
      style={{
        overflow: "hidden",
        borderTop: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--bg) 80%, transparent)",
        padding: "7px 0",
      }}
    >
      <style>{`
        @keyframes banda-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
      <div
        style={{
          display: "inline-flex",
          gap: 8,
          alignItems: "center",
          whiteSpace: "nowrap",
          animation: `banda-marquee ${duration}s linear infinite`,
        }}
      >
        <ChipsContent
          todosDesc={todosDesc}
          promosHoy={promosHoy}
          listPrice={listPrice}
          tieneDescuentos={tieneDescuentos}
          tienePromos={tienePromos}
          keyPrefix="a"
        />
        <ChipsContent
          todosDesc={todosDesc}
          promosHoy={promosHoy}
          listPrice={listPrice}
          tieneDescuentos={tieneDescuentos}
          tienePromos={tienePromos}
          keyPrefix="b"
        />
      </div>
    </div>
  );
}
