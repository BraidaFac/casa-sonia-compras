"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarClock, Clock, CreditCard, Percent, RotateCcw,
  Banknote, FileDown,
} from "lucide-react";
import { Group, Text, Button } from "@mantine/core";
import { useConfigVigente } from "@/hooks/useConfigVigente";
import { getBankIcon, BANK_ICON_VIEWBOX } from "@/lib/bankIcons";
import { PROMO_TOKENS_PAGE } from "@/lib/promoTokens";
import { GenerarPdfPromoModal } from "@/components/config/GenerarPdfPromoModal";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { PromoVigente } from "@/lib/configPricing";

const T = PROMO_TOKENS_PAGE;

// ─── TIPO CONFIG (unified color — label + icon only) ──────────────────────────

const TIPO_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  cuotas_sin_interes:   { label: "Sin interés",       icon: <CreditCard size={11} /> },
  cuotas_con_interes:   { label: "Con interés",        icon: <CreditCard size={11} /> },
  reintegro:            { label: "Reintegro",          icon: <RotateCcw size={11} /> },
  descuento_directo:    { label: "Descuento",          icon: <Percent size={11} /> },
  cuotas_con_descuento: { label: "Cuotas + desc.",     icon: <CreditCard size={11} /> },
  cuotas_con_reintegro: { label: "Cuotas + reintegro", icon: <CreditCard size={11} /> },
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DIAS_SEMANA = ["lunes","martes","miercoles","jueves","viernes","sabado","domingo"] as const;
const DIA_LABEL_CORTO: Record<string, string> = {
  lunes: "Lun", martes: "Mar", miercoles: "Mié",
  jueves: "Jue", viernes: "Vie", sabado: "Sáb", domingo: "Dom",
};
const DIA_LABEL_LARGO: Record<string, string> = {
  lunes: "Lunes", martes: "Martes", miercoles: "Miércoles",
  jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", domingo: "Domingo",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function parseDias(diasJson: string | null): string[] {
  if (!diasJson) return [];
  try { return JSON.parse(diasJson); } catch { return []; }
}

function formatFecha(iso: string | null | undefined): string {
  if (!iso) return "∞";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function getBeneficioMain(promo: PromoVigente): string {
  switch (promo.tipoBeneficio) {
    case "cuotas_sin_interes":
    case "cuotas_con_interes":
    case "cuotas_con_descuento":
    case "cuotas_con_reintegro":
      return `${promo.cantidadCuotas}`;
    case "reintegro":
    case "descuento_directo":
      return `${Number(promo.valorPorcentaje)}%`;
    default: return "-";
  }
}

function getBeneficioSub(promo: PromoVigente): string {
  switch (promo.tipoBeneficio) {
    case "cuotas_sin_interes": return "cuotas sin interés";
    case "cuotas_con_interes": return `cuotas (coef. ${Number(promo.coeficienteInteres).toFixed(2)})`;
    case "reintegro":
      return promo.topeReintegro
        ? `reintegro (tope $${Number(promo.topeReintegro).toLocaleString("es-AR")})`
        : "de reintegro";
    case "descuento_directo": return "de descuento";
    case "cuotas_con_descuento": {
      const pct = Number(promo.valorPorcentaje);
      const tope = promo.topeReintegro ? ` · tope $${Number(promo.topeReintegro).toLocaleString("es-AR")}` : "";
      return `cuotas sin interés · ${pct}% desc. en caja${tope}`;
    }
    case "cuotas_con_reintegro": {
      const pct = Number(promo.valorPorcentaje);
      const tope = promo.topeReintegro ? ` · tope $${Number(promo.topeReintegro).toLocaleString("es-AR")}` : "";
      return `cuotas sin interés · ${pct}% reintegro${tope}`;
    }
    default: return "";
  }
}

// Groups promos by their day-applicability pattern for visual sectioning
function groupPromosByDays(promos: PromoVigente[]): { key: string; label: string; promos: PromoVigente[] }[] {
  const groups = new Map<string, PromoVigente[]>();
  for (const promo of promos) {
    const dias = parseDias(promo.diasAplicables);
    const sorted = dias.length === 0
      ? []
      : [...dias].sort((a, b) =>
          DIAS_SEMANA.indexOf(a as typeof DIAS_SEMANA[number]) -
          DIAS_SEMANA.indexOf(b as typeof DIAS_SEMANA[number])
        );
    const key = sorted.length === 0 ? "__todos__" : sorted.join(",");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(promo);
  }

  const result: { key: string; label: string; promos: PromoVigente[] }[] = [];

  if (groups.has("__todos__")) {
    result.push({ key: "__todos__", label: "Todos los días", promos: groups.get("__todos__")! });
  }

  const remaining = [...groups.entries()]
    .filter(([k]) => k !== "__todos__")
    .sort(([a], [b]) => {
      const firstA = a.split(",")[0];
      const firstB = b.split(",")[0];
      return (
        DIAS_SEMANA.indexOf(firstA as typeof DIAS_SEMANA[number]) -
        DIAS_SEMANA.indexOf(firstB as typeof DIAS_SEMANA[number])
      );
    });

  for (const [key, dayPromos] of remaining) {
    const dias = key.split(",");
    const label = dias.map((d) => DIA_LABEL_LARGO[d] ?? d).join(" · ");
    result.push({ key, label, promos: dayPromos });
  }

  return result;
}

// ─── BankLogosStack ───────────────────────────────────────────────────────────

function BankLogosStack({ bancos }: { bancos: PromoVigente["bancos"] }) {
  const visible = bancos.slice(0, 3);
  const extra = bancos.length - 3;
  const iconSize = 32;
  const overlap = 10;
  const totalW = visible.length * iconSize - (visible.length - 1) * overlap;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
      <div style={{ position: "relative", width: totalW, height: iconSize }}>
        {visible.map((b, i) => {
          const entry = getBankIcon(b.icono);
          const initials = b.nombre.slice(0, 2).toUpperCase();
          return (
            <div
              key={b.id}
              title={b.nombre}
              style={{
                position: "absolute",
                left: i * (iconSize - overlap),
                top: 0,
                width: iconSize,
                height: iconSize,
                borderRadius: "50%",
                background: "#FFFFFF",
                border: `1.5px solid ${T.cardBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: visible.length - i,
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                overflow: "hidden",
              }}
            >
              {entry ? (
                entry.svgSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.svgSrc}
                    width={Math.round(18 * (entry.scale ?? 1))}
                    height={Math.round(18 * (entry.scale ?? 1))}
                    alt={entry.nombre}
                    style={{ objectFit: "contain" }}
                  />
                ) : (
                  <svg viewBox={entry.viewBox ?? BANK_ICON_VIEWBOX} width={18} height={18} fill={`#${entry.color}`}>
                    <path d={entry.svgPath} />
                  </svg>
                )
              ) : (
                <span style={{ fontSize: 9, fontWeight: 700, color: T.text2, letterSpacing: "-0.02em" }}>
                  {initials}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {extra > 0 && (
        <span style={{ fontSize: 10, color: T.text3, fontWeight: 600 }}>+{extra}</span>
      )}
    </div>
  );
}

// ─── PromoCard ────────────────────────────────────────────────────────────────

function PromoCard({ promo, dimmed }: { promo: PromoVigente; dimmed?: boolean }) {
  const tipo = TIPO_CONFIG[promo.tipoBeneficio] ?? { label: promo.tipoBeneficio, icon: <Banknote size={11} /> };
  const dias = parseDias(promo.diasAplicables);
  const beneficioMain = getBeneficioMain(promo);
  const beneficioSub = getBeneficioSub(promo);
  const bancoNames = promo.bancos.map((b) => b.nombre).join(" · ");
  const accent = dimmed ? T.text3 : T.accent;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: dimmed ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      whileHover={dimmed ? {} : { y: -2, transition: { duration: 0.13 } }}
      style={{
        borderRadius: 12,
        background: T.cardBg,
        border: `1px solid ${T.cardBorder}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "row",
        width: "100%",
        boxShadow: dimmed ? "none" : "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {/* Left accent bar — fixed 3px strip */}
      <div style={{ width: 3, background: accent, flexShrink: 0 }} />

      {/* Card content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header: logos + bank name + badge */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px 0 14px",
          gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <BankLogosStack bancos={promo.bancos} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: T.text1,
                fontFamily: "var(--font-sans)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {bancoNames}
              </div>
              {promo.marcaTarjeta && (
                <div style={{ fontSize: 10, color: T.text2, marginTop: 1 }}>
                  {promo.marcaTarjeta}
                </div>
              )}
            </div>
          </div>

          {/* Type badge — same accent for all, differentiated by label + icon */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            padding: "3px 8px",
            borderRadius: 20,
            background: dimmed ? "rgba(0,0,0,0.04)" : T.accentBg,
            border: `1px solid ${dimmed ? T.cardBorder : T.accentBorder}`,
            flexShrink: 0,
          }}>
            <span style={{ color: accent, display: "flex" }}>{tipo.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: accent, whiteSpace: "nowrap" }}>
              {tipo.label}
            </span>
          </div>
        </div>

        {/* Dashed divider */}
        <div style={{
          margin: "10px 14px",
          borderTop: `1px dashed ${T.cardBorder}`,
        }} />

        {/* Main benefit */}
        <div style={{
          padding: "0 14px",
          display: "flex",
          alignItems: "baseline",
          gap: 8,
        }}>
          <span style={{
            fontSize: 40,
            fontWeight: 900,
            fontFamily: "var(--font-display)",
            color: accent,
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}>
            {beneficioMain}
          </span>
          <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: T.text2,
            lineHeight: 1.4,
            flex: 1,
            minWidth: 0,
          }}>
            {beneficioSub}
          </span>
        </div>

        {/* Optional: title */}
        {promo.titulo && (
          <div style={{
            padding: "5px 14px 0",
            fontSize: 11,
            color: T.text2,
            fontStyle: "italic",
          }}>
            {promo.titulo}
          </div>
        )}

        {/* Optional: special conditions / description */}
        {promo.descripcion && (
          <div style={{
            margin: "8px 14px 0",
            padding: "6px 8px",
            borderRadius: 6,
            background: "rgba(0,0,0,0.03)",
            border: `1px solid ${T.cardBorder}`,
            fontSize: 11,
            color: T.text2,
            lineHeight: 1.5,
          }}>
            {promo.descripcion}
          </div>
        )}

        {/* Footer: day indicators + vigencia */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px 12px",
          marginTop: "auto",
          gap: 8,
        }}>
          {/* Day dots */}
          <div style={{ display: "flex", gap: 3 }}>
            {DIAS_SEMANA.map((dia) => {
              const activo = dias.length === 0 || dias.includes(dia);
              return (
                <div
                  key={dia}
                  title={DIA_LABEL_LARGO[dia]}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 7,
                    fontWeight: 700,
                    background: activo ? (dimmed ? "rgba(0,0,0,0.06)" : T.accentBg) : "transparent",
                    color: activo ? accent : T.text3,
                    border: `1px solid ${activo ? (dimmed ? T.cardBorder : T.accentBorder) : "transparent"}`,
                    opacity: activo ? 1 : 0.22,
                  }}
                >
                  {DIA_LABEL_CORTO[dia].slice(0, 1)}
                </div>
              );
            })}
          </div>

          {/* Vigencia */}
          <span style={{ fontSize: 10, color: T.text3, whiteSpace: "nowrap" }}>
            {formatFecha(promo.vigenciaDesde as unknown as string)} →{" "}
            {formatFecha(promo.vigenciaHasta as unknown as string | null)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── PromoGrid ────────────────────────────────────────────────────────────────

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

function PromoGrid({ promos, dimmed }: { promos: PromoVigente[]; dimmed?: boolean }) {
  return (
    <motion.div
      key={JSON.stringify(promos.map((p) => p.id))}
      variants={gridVariants}
      initial="hidden"
      animate="visible"
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 12,
        overflowX: "auto",
        scrollSnapType: "x mandatory",
        paddingBottom: 8,
        WebkitOverflowScrolling: "touch",
      }}
    >
      <AnimatePresence>
        {promos.map((p) => (
          <div key={p.id} style={{ flex: "0 0 280px", scrollSnapAlign: "start", display: "flex" }}>
            <PromoCard promo={p} dimmed={dimmed} />
          </div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── DayGroupSection ──────────────────────────────────────────────────────────

function DayGroupSection({ label, promos, dimmed }: {
  label: string;
  promos: PromoVigente[];
  dimmed?: boolean;
}) {
  const accent = dimmed ? T.text3 : T.accent;
  return (
    <section>
      {/* Section header with horizontal rule */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 16,
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: dimmed ? T.text3 : T.text2,
          fontFamily: "var(--font-sans)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          whiteSpace: "nowrap",
        }}>
          {label}
        </span>
        <div style={{ flex: 1, height: 1, background: T.sectionLine }} />
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: accent,
          background: dimmed ? "rgba(0,0,0,0.04)" : T.accentBg,
          border: `1px solid ${dimmed ? T.cardBorder : T.accentBorder}`,
          padding: "1px 8px",
          borderRadius: 20,
          flexShrink: 0,
        }}>
          {promos.length}
        </span>
      </div>
      <PromoGrid promos={promos} dimmed={dimmed} />
    </section>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 24px",
        gap: 12,
      }}
    >
      <CalendarClock size={36} strokeWidth={1.3} style={{ color: T.text3 }} />
      <span style={{ fontSize: 14, fontWeight: 600, color: T.text2 }}>
        Sin promociones vigentes hoy
      </span>
      <span style={{ fontSize: 12, color: T.text3, textAlign: "center" }}>
        No hay promociones bancarias activas para la fecha de hoy.
      </span>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PromocionesVigentesPage() {
  const { data: config, isLoading, error } = useConfigVigente();
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  const promosHoy = config?.promos.hoy ?? [];
  const otrosDiasGroups = config ? groupPromosByDays(config.promos.otrosDias) : [];
  const proximasGroups = config ? groupPromosByDays(config.promos.proximas) : [];

  return (
    <div style={{ padding: "24px 24px 80px" }}>
      <Group justify="space-between" align="flex-start" mb="xl">
        <div>
          <h1 style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text)",
          }}>
            Promociones bancarias
          </h1>
          <Text size="xs" c="dimmed" mt={2}>Promociones bancarias vigentes hoy</Text>
        </div>
        <Button
          color="amber"
          variant="filled"
          size="sm"
          leftSection={<FileDown size={14} />}
          disabled={!config}
          onClick={() => setPdfModalOpen(true)}
        >
          Generar PDF
        </Button>
      </Group>

      {isLoading && <LoadingSpinner size={20} label="Cargando..." />}
      {error && (
        <div style={{ color: "#EF4444", fontSize: 13 }}>
          Error al cargar las promociones.
        </div>
      )}

      {config && (
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>

            {/* ── HOY ── */}
            {promosHoy.length === 0 && otrosDiasGroups.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {promosHoy.length > 0 && (
                  <DayGroupSection
                    key="hoy"
                    label="Hoy"
                    promos={promosHoy}
                  />
                )}

                {/* ── VIGENTES OTROS DÍAS ── */}
                {otrosDiasGroups.length > 0 && (
                  <>
                    {otrosDiasGroups.map((group) => (
                      <DayGroupSection
                        key={group.key}
                        label={group.label}
                        promos={group.promos}
                      />
                    ))}
                  </>
                )}
              </>
            )}

            {/* ── PRÓXIMAS (vigenciaDesde futuro) ── */}
            {proximasGroups.length > 0 && (
              <>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 4,
                }}>
                  <Clock size={13} style={{ color: T.text3, flexShrink: 0 }} />
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: T.text3,
                    fontFamily: "var(--font-sans)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    whiteSpace: "nowrap",
                  }}>
                    Próximas
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.sectionLine }} />
                </div>
                {proximasGroups.map((group) => (
                  <DayGroupSection
                    key={`proximas-${group.key}`}
                    label={group.label}
                    promos={group.promos}
                    dimmed
                  />
                ))}
              </>
            )}

          </div>
        )}

      {config && (
        <GenerarPdfPromoModal
          opened={pdfModalOpen}
          onClose={() => setPdfModalOpen(false)}
          promosHoy={config.promos.hoy}
          promosOtrosDias={config.promos.otrosDias}
          promosProximas={config.promos.proximas}
          descuentos={config.descuentos}
        />
      )}
    </div>
  );
}
