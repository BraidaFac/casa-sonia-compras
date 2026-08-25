"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarClock, Clock, CreditCard, Percent, RotateCcw, Banknote, AlertCircle } from "lucide-react";
import { useConfigVigente } from "@/hooks/useConfigVigente";
import { getBankIcon, BANK_ICON_VIEWBOX } from "@/lib/bankIcons";
import type { PromoVigente } from "@/lib/configPricing";

// ─── constants ────────────────────────────────────────────────────────────────

const DIAS_SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as const;
const DIA_LABEL_CORTO: Record<string, string> = {
  lunes: "Lun", martes: "Mar", miercoles: "Mié",
  jueves: "Jue", viernes: "Vie", sabado: "Sáb", domingo: "Dom",
};
const DIA_LABEL_LARGO: Record<string, string> = {
  lunes: "Lunes", martes: "Martes", miercoles: "Miércoles",
  jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", domingo: "Domingo",
};

const TIPO_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  cuotas_sin_interes: { label: "Sin interés", color: "#22c55e", icon: <CreditCard size={13} /> },
  cuotas_con_interes: { label: "Con interés", color: "#f59e0b", icon: <CreditCard size={13} /> },
  reintegro: { label: "Reintegro", color: "#3b82f6", icon: <RotateCcw size={13} /> },
  descuento_directo: { label: "Descuento", color: "#a855f7", icon: <Percent size={13} /> },
  cuotas_con_descuento: { label: "Cuotas + desc.", color: "#ec4899", icon: <CreditCard size={13} /> },
  cuotas_con_reintegro: { label: "Cuotas + reintegro", color: "#06b6d4", icon: <CreditCard size={13} /> },
};

// ─── helpers ──────────────────────────────────────────────────────────────────

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
    default:
      return "-";
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

function getTodayDayName(): string {
  const bsas = new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" });
  const day = new Date(bsas).getDay();
  return ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"][day];
}

function promoAplicaEnDia(promo: PromoVigente, dia: string): boolean {
  const dias = parseDias(promo.diasAplicables);
  if (dias.length === 0) return true; // todos los días
  return dias.includes(dia);
}

// ─── BankIconSvg ──────────────────────────────────────────────────────────────

function BankIconSvg({ icono, size = 24 }: { icono: string | null; size?: number }) {
  const entry = getBankIcon(icono);
  if (!entry) return null;
  const scaledSize = Math.round(size * (entry.scale ?? 1));
  if (entry.svgSrc) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={entry.svgSrc} width={scaledSize} height={scaledSize} alt={entry.nombre} style={{ flexShrink: 0, objectFit: "contain" }} />;
  }
  return (
    <svg
      viewBox={entry.viewBox ?? BANK_ICON_VIEWBOX}
      width={scaledSize}
      height={scaledSize}
      fill={`#${entry.color}`}
      aria-label={entry.nombre}
      style={{ flexShrink: 0 }}
    >
      <path d={entry.svgPath} />
    </svg>
  );
}

// ─── BankLogosStack ───────────────────────────────────────────────────────────
// Shows up to 3 bank icons overlapping; +N if more

function BankLogosStack({ bancos }: { bancos: PromoVigente["bancos"] }) {
  const visible = bancos.slice(0, 3);
  const extra = bancos.length - 3;
  const iconSize = 28;
  const overlap = 10;
  const totalW = visible.length * iconSize - (visible.length - 1) * overlap;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: totalW, height: iconSize, flexShrink: 0 }}>
        {visible.map((b, i) => {
          const entry = getBankIcon(b.icono);
          return (
            <div
              key={b.id}
              style={{
                position: "absolute",
                left: i * (iconSize - overlap),
                top: 0,
                width: iconSize,
                height: iconSize,
                borderRadius: "50%",
                background: "#ffffff",
                border: "1.5px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: visible.length - i,
              }}
            >
              {entry ? (
                entry.svgSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.svgSrc} width={Math.round(16 * (entry.scale ?? 1))} height={Math.round(16 * (entry.scale ?? 1))} alt={entry.nombre} style={{ objectFit: "contain" }} />
                ) : (
                  <svg viewBox={entry.viewBox ?? BANK_ICON_VIEWBOX} width={16} height={16} fill={`#${entry.color}`}>
                    <path d={entry.svgPath} />
                  </svg>
                )
              ) : (
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text3)" }}>
                  {b.nombre.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {extra > 0 && (
        <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>+{extra}</span>
      )}
    </div>
  );
}

// ─── PromoCard (ticket style) ─────────────────────────────────────────────────

function PromoCard({ promo, dimmed, accentOverride }: { promo: PromoVigente; dimmed?: boolean; accentOverride?: string }) {
  const tipo = TIPO_CONFIG[promo.tipoBeneficio] ?? { label: promo.tipoBeneficio, color: "#888", icon: <Banknote size={13} /> };
  const accentColor = accentOverride ?? tipo.color;
  const dias = parseDias(promo.diasAplicables);
  const beneficioMain = getBeneficioMain(promo);
  const beneficioSub = getBeneficioSub(promo);
  const bancoNames = promo.bancos.map((b) => b.nombre).join(" · ");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: dimmed ? 0.55 : 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      style={{
        borderRadius: 12,
        background: "var(--surface)",
        border: `1px solid ${dimmed ? "var(--border)" : `color-mix(in srgb, ${accentColor} 25%, var(--border))`}`,
        overflow: "hidden",
        cursor: "default",
      }}
    >
      {/* Top accent line */}
      {!dimmed && (
        <div style={{ height: 3, background: accentColor, opacity: 0.7 }} />
      )}

      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px 0",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <BankLogosStack bancos={promo.bancos} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--text1)",
                fontFamily: "var(--font-sans)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {bancoNames}
            </div>
            {promo.marcaTarjeta && (
              <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 1 }}>
                {promo.marcaTarjeta}
              </div>
            )}
          </div>
        </div>

        {/* Tipo badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 20,
            background: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${accentColor} 30%, transparent)`,
            flexShrink: 0,
          }}
        >
          <span style={{ color: accentColor }}>{tipo.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: accentColor, whiteSpace: "nowrap" }}>
            {tipo.label}
          </span>
        </div>
      </div>

      {/* Dashed divider */}
      <div
        style={{
          margin: "10px 16px",
          borderTop: `1.5px dashed color-mix(in srgb, ${accentColor} 20%, var(--border))`,
        }}
      />

      {/* Benefit highlight */}
      <div style={{ padding: "0 16px", display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: 38,
            fontWeight: 900,
            fontFamily: "var(--font-display)",
            color: dimmed ? "var(--text3)" : accentColor,
            lineHeight: 1,
          }}
        >
          {beneficioMain}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text2)",
            lineHeight: 1.3,
            maxWidth: 120,
          }}
        >
          {beneficioSub}
        </span>
      </div>

      {/* Title */}
      {promo.titulo && (
        <div style={{ padding: "6px 16px 0", fontSize: 11, color: "var(--text3)", fontStyle: "italic" }}>
          {promo.titulo}
        </div>
      )}

      {/* Condiciones especiales / Aplica siempre */}
      <div
        style={{
          margin: "8px 16px 0",
          padding: "5px 8px",
          borderRadius: 6,
          background: `color-mix(in srgb, ${accentColor} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${accentColor} 35%, transparent)`,
          borderLeft: `3px solid ${accentColor}`,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <span style={{ color: accentColor, flexShrink: 0 }}>
          <AlertCircle size={11} />
        </span>
        <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 5, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: accentColor, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
            {promo.descripcion ? "Condiciones especiales" : "Aplica siempre"}
          </span>
          {promo.descripcion && (
            <span style={{ fontSize: 10, color: "var(--text1)", lineHeight: 1.4 }}>
              {promo.descripcion}
            </span>
          )}
        </div>
      </div>

      {/* Footer row: days + dates */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px 12px",
          gap: 8,
          marginTop: 2,
        }}
      >
        {/* Day dots */}
        <div style={{ display: "flex", gap: 4 }}>
          {DIAS_SEMANA.map((dia) => {
            const activo = dias.length === 0 || dias.includes(dia);
            return (
              <div
                key={dia}
                title={DIA_LABEL_LARGO[dia]}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8,
                  fontWeight: 700,
                  background: activo
                    ? `color-mix(in srgb, ${accentColor} 18%, transparent)`
                    : "transparent",
                  color: activo ? accentColor : "var(--text3)",
                  border: activo
                    ? `1px solid color-mix(in srgb, ${accentColor} 35%, transparent)`
                    : "1px solid transparent",
                  opacity: activo ? 1 : 0.3,
                }}
              >
                {DIA_LABEL_CORTO[dia].slice(0, 1)}
              </div>
            );
          })}
        </div>

        {/* Vigencia */}
        <span style={{ fontSize: 10, color: "var(--text3)", whiteSpace: "nowrap" }}>
          {formatFecha(promo.vigenciaDesde as unknown as string)} →{" "}
          {formatFecha(promo.vigenciaHasta as unknown as string | null)}
        </span>
      </div>
    </motion.div>
  );
}

// ─── PromoGrid ────────────────────────────────────────────────────────────────

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

function PromoGrid({ promos, dimmed, accentOverride }: { promos: PromoVigente[]; dimmed?: boolean; accentOverride?: string }) {
  return (
    <motion.div
      key={JSON.stringify(promos.map((p) => p.id))}
      variants={gridVariants}
      initial="hidden"
      animate="visible"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 14,
      }}
    >
      <AnimatePresence>
        {promos.map((p) => (
          <PromoCard key={p.id} promo={p} dimmed={dimmed} accentOverride={accentOverride} />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── EmptyDayState ────────────────────────────────────────────────────────────

function EmptyDayState({ dia }: { dia: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        borderRadius: 12,
        border: "1.5px dashed var(--border)",
        color: "var(--text3)",
        gap: 10,
      }}
    >
      <CalendarClock size={32} strokeWidth={1.5} />
      <span style={{ fontSize: 13, fontWeight: 600 }}>
        Sin promociones para el {DIA_LABEL_LARGO[dia].toLowerCase()}
      </span>
    </motion.div>
  );
}

// ─── SectionTitle ─────────────────────────────────────────────────────────────

function SectionTitle({ icon, label, count, color }: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <span style={{ color }}>{icon}</span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          fontFamily: "var(--font-sans)",
          color: "var(--text2)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </span>
      {count > 0 && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color,
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
            padding: "1px 8px",
            borderRadius: 20,
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ─── DayTabs ──────────────────────────────────────────────────────────────────

function DayTabs({
  selectedDay,
  onSelect,
  promos,
}: {
  selectedDay: string;
  onSelect: (day: string) => void;
  promos: PromoVigente[];
}) {
  const today = getTodayDayName();

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        marginBottom: 20,
        borderBottom: "1px solid var(--border)",
        paddingBottom: 0,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {DIAS_SEMANA.map((dia) => {
        const active = selectedDay === dia;
        const isToday = dia === today;
        const hasPromos = promos.some((p) => promoAplicaEnDia(p, dia));

        return (
          <button
            key={dia}
            onClick={() => onSelect(dia)}
            style={{
              position: "relative",
              padding: "8px 14px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              color: active ? "var(--mantine-color-amber-4)" : isToday ? "var(--text1)" : "var(--text3)",
              whiteSpace: "nowrap",
              transition: "color 0.15s",
              borderBottom: "2px solid transparent",
            }}
          >
            {DIA_LABEL_CORTO[dia]}
            {isToday && (
              <span
                style={{
                  display: "inline-block",
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: "var(--mantine-color-amber-4)",
                  marginLeft: 4,
                  verticalAlign: "middle",
                  marginBottom: 2,
                }}
              />
            )}
            {hasPromos && !isToday && (
              <span
                style={{
                  display: "inline-block",
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: "var(--text3)",
                  marginLeft: 4,
                  verticalAlign: "middle",
                  marginBottom: 2,
                  opacity: 0.5,
                }}
              />
            )}
            {active && (
              <motion.div
                layoutId="tab-underline"
                style={{
                  position: "absolute",
                  bottom: -1,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: "var(--mantine-color-amber-4)",
                  borderRadius: 2,
                }}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PromocionesVigentesPage() {
  const { data: config, isLoading, error } = useConfigVigente();
  const today = getTodayDayName();
  const [selectedDay, setSelectedDay] = useState<string>(today);

  const promosDelDia = config
    ? config.promos.hoy.filter((p) => promoAplicaEnDia(p, selectedDay))
    : [];

  return (
    <div style={{ padding: "32px 40px" }}>
      <p
        style={{
          margin: 0,
          marginBottom: 24,
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "var(--font-display)",
          color: "var(--text1)",
        }}
      >
        Promociones bancarias
      </p>

      {isLoading && (
        <div style={{ color: "var(--text3)", fontSize: 13 }}>Cargando...</div>
      )}
      {error && (
        <div style={{ color: "var(--mantine-color-red-4)", fontSize: 13 }}>
          Error al cargar las promociones.
        </div>
      )}

      {config && (
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>

          {/* ── VIGENTES HOY ─────────────────────────────────────────────── */}
          <section>
            <SectionTitle
              icon={<CalendarClock size={18} />}
              label="Vigentes hoy"
              count={config.promos.hoy.length}
              color="var(--mantine-color-amber-4)"
            />
            {config.promos.hoy.length === 0 ? (
              <div style={{ color: "var(--text3)", fontSize: 13 }}>
                No hay promociones vigentes para hoy.
              </div>
            ) : (
              <PromoGrid promos={config.promos.hoy} />
            )}
          </section>

          {/* ── POR DÍA ──────────────────────────────────────────────────── */}
          <section>
            <SectionTitle
              icon={<CalendarClock size={18} />}
              label="Por día"
              count={0}
              color="var(--text3)"
            />
            <DayTabs
              selectedDay={selectedDay}
              onSelect={setSelectedDay}
              promos={config?.promos.hoy ?? []}
            />
            <AnimatePresence mode="wait">
              {promosDelDia.length === 0 ? (
                <EmptyDayState key={`empty-${selectedDay}`} dia={selectedDay} />
              ) : (
                <motion.div
                  key={selectedDay}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <PromoGrid promos={promosDelDia} accentOverride="var(--mantine-color-blue-5)" />
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* ── PRÓXIMAS ─────────────────────────────────────────────────── */}
          {config.promos.proximas.length > 0 && (
            <section>
              <SectionTitle
                icon={<Clock size={18} />}
                label="Próximas"
                count={config.promos.proximas.length}
                color="var(--text3)"
              />
              <PromoGrid promos={config.promos.proximas} dimmed />
            </section>
          )}

        </div>
      )}
    </div>
  );
}
