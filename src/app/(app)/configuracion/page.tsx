"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { Tabs, Button, Badge, Group, Text, Tooltip } from "@mantine/core";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { MedioPagoModal } from "@/components/config/MedioPagoModal";
import { BancoModal, BancoIcono } from "@/components/config/BancoModal";
import { DescuentoModal } from "@/components/config/DescuentoModal";
import { PromocionModal } from "@/components/config/PromocionModal";
import type { MedioPagoRecord } from "@/components/config/MedioPagoModal";
import type { BancoRecord } from "@/components/config/BancoModal";
import type { DescuentoRecord } from "@/components/config/DescuentoModal";
import type { PromocionRecord, PromocionSaveData } from "@/components/config/PromocionModal";
import type { ProductCategory } from "@/app/api/categories/route";

// ─── fetch helpers ──────────────────────────────────────────────────────────

async function fetchMedios(): Promise<MedioPagoRecord[]> {
  const r = await fetch("/api/config/medios-pago");
  if (!r.ok) throw new Error("Error al cargar medios de pago");
  return r.json();
}
async function fetchBancos(): Promise<BancoRecord[]> {
  const r = await fetch("/api/config/bancos");
  if (!r.ok) throw new Error("Error al cargar bancos");
  return r.json();
}
async function fetchDescuentos(): Promise<DescuentoRecord[]> {
  const r = await fetch("/api/config/descuentos");
  if (!r.ok) throw new Error("Error al cargar descuentos");
  return r.json();
}
async function fetchPromociones(): Promise<PromocionRecord[]> {
  const r = await fetch("/api/config/promociones");
  if (!r.ok) throw new Error("Error al cargar promociones");
  return r.json();
}
async function fetchCategorias(): Promise<ProductCategory[]> {
  const r = await fetch("/api/categories");
  if (!r.ok) throw new Error("Error al cargar categorías");
  return r.json();
}

// ─── helpers UI ─────────────────────────────────────────────────────────────

const TH_STYLE = {
  padding: "10px 16px",
  textAlign: "left" as const,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text3)",
  fontFamily: "var(--font-sans)",
};
const TD_STYLE = {
  padding: "12px 16px",
  fontSize: 13,
  color: "var(--text1)",
  fontFamily: "var(--font-sans)",
};
const TABLE_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  overflow: "hidden" as const,
};

function ActionBtn({
  onClick, icon, tooltip, disabled,
}: { onClick: () => void; icon: React.ReactNode; tooltip: string; disabled?: boolean }) {
  return (
    <Tooltip label={tooltip} withArrow position="top">
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          background: "none", border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          color: disabled ? "var(--text3)" : "var(--text2)",
          padding: 4, borderRadius: 4, display: "flex", alignItems: "center",
        }}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <tr>
      <td colSpan={cols} style={{ ...TD_STYLE, textAlign: "center", color: "var(--text3)", padding: "32px 16px" }}>
        {msg}
      </td>
    </tr>
  );
}

// ─── página ─────────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading: loadingMe } = useCurrentEmployee();

  useEffect(() => {
    if (!loadingMe && me && me.role !== "ADMIN" && me.role !== "MANAGER") {
      router.replace("/orders");
    }
  }, [me, loadingMe, router]);

  const enabled = !!me && (me.role === "ADMIN" || me.role === "MANAGER");

  const { data: medios = [] } = useQuery({ queryKey: ["config-medios"], queryFn: fetchMedios, enabled, staleTime: Infinity });
  const { data: bancos = [] } = useQuery({ queryKey: ["config-bancos"], queryFn: fetchBancos, enabled, staleTime: Infinity });
  const { data: descuentos = [] } = useQuery({ queryKey: ["config-descuentos"], queryFn: fetchDescuentos, enabled, staleTime: Infinity });
  const { data: promociones = [] } = useQuery({ queryKey: ["config-promociones"], queryFn: fetchPromociones, enabled, staleTime: Infinity });
  const { data: categorias = [] } = useQuery({ queryKey: queryKeys.categories(), queryFn: fetchCategorias, enabled, staleTime: Infinity });

  // ── modal state ────────────────────────────────────────────────────────────
  const [medioModal, setMedioModal] = useState(false);
  const [editMedio, setEditMedio] = useState<MedioPagoRecord | null>(null);
  const [medioError, setMedioError] = useState<string | null>(null);

  const [bancoModal, setBancoModal] = useState(false);
  const [editBanco, setEditBanco] = useState<BancoRecord | null>(null);
  const [bancoError, setBancoError] = useState<string | null>(null);

  const [descModal, setDescModal] = useState(false);
  const [editDesc, setEditDesc] = useState<DescuentoRecord | null>(null);
  const [descError, setDescError] = useState<string | null>(null);

  const [promoModal, setPromoModal] = useState(false);
  const [editPromo, setEditPromo] = useState<PromocionRecord | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  // ── mutations ──────────────────────────────────────────────────────────────

  function makeMutation<T>(
    url: (id?: number) => string,
    method: (id?: number) => string,
    queryKey: string,
    onSuccess: () => void,
    setError: (e: string | null) => void,
  ) {
    return useMutation({
      mutationFn: async ({ id, data }: { id?: number; data?: T }) => {
        const r = await fetch(url(id), {
          method: method(id),
          headers: { "Content-Type": "application/json" },
          body: data ? JSON.stringify(data) : undefined,
        });
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.error ?? "Error al guardar");
        }
        if (r.status === 204) return null;
        return r.json();
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
        queryClient.invalidateQueries({ queryKey: queryKeys.config.vigente() });
        queryClient.invalidateQueries({ queryKey: queryKeys.config.categorias() });
        onSuccess();
        setError(null);
      },
      onError: (e: Error) => setError(e.message),
    });
  }

  const medioMutation = makeMutation(
    (id) => id ? `/api/config/medios-pago/${id}` : "/api/config/medios-pago",
    (id) => id ? "PATCH" : "POST",
    "config-medios",
    () => { setMedioModal(false); setEditMedio(null); },
    setMedioError,
  );
  const medioDeleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/config/medios-pago/${id}`, { method: "DELETE" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Error"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["config-medios"] }); queryClient.invalidateQueries({ queryKey: queryKeys.config.vigente() });
        queryClient.invalidateQueries({ queryKey: queryKeys.config.categorias() }); },
    onError: (e: Error) => alert(e.message),
  });

  const bancoMutation = makeMutation(
    (id) => id ? `/api/config/bancos/${id}` : "/api/config/bancos",
    (id) => id ? "PATCH" : "POST",
    "config-bancos",
    () => { setBancoModal(false); setEditBanco(null); },
    setBancoError,
  );
  const bancoDeleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/config/bancos/${id}`, { method: "DELETE" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Error"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["config-bancos"] }); queryClient.invalidateQueries({ queryKey: queryKeys.config.vigente() });
        queryClient.invalidateQueries({ queryKey: queryKeys.config.categorias() }); },
    onError: (e: Error) => alert(e.message),
  });

  const descMutation = makeMutation(
    (id) => id ? `/api/config/descuentos/${id}` : "/api/config/descuentos",
    (id) => id ? "PATCH" : "POST",
    "config-descuentos",
    () => { setDescModal(false); setEditDesc(null); },
    setDescError,
  );
  const descDeleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/config/descuentos/${id}`, { method: "DELETE" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Error"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["config-descuentos"] }); queryClient.invalidateQueries({ queryKey: queryKeys.config.vigente() });
        queryClient.invalidateQueries({ queryKey: queryKeys.config.categorias() }); },
    onError: (e: Error) => alert(e.message),
  });

  const promoMutation = makeMutation(
    (id) => id ? `/api/config/promociones/${id}` : "/api/config/promociones",
    (id) => id ? "PATCH" : "POST",
    "config-promociones",
    () => { setPromoModal(false); setEditPromo(null); },
    setPromoError,
  );
  const promoDeleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/config/promociones/${id}`, { method: "DELETE" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Error"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["config-promociones"] }); queryClient.invalidateQueries({ queryKey: queryKeys.config.vigente() });
        queryClient.invalidateQueries({ queryKey: queryKeys.config.categorias() }); },
    onError: (e: Error) => alert(e.message),
  });

  if (loadingMe || !me) {
    return <div style={{ padding: 32, color: "var(--text2)", fontFamily: "var(--font-sans)" }}>Cargando...</div>;
  }
  if (me.role !== "ADMIN" && me.role !== "MANAGER") return null;

  const TIPO_LABEL: Record<string, string> = {
    cuotas_sin_interes: "Cuotas s/interés",
    cuotas_con_interes: "Cuotas c/interés",
    reintegro: "Reintegro",
    descuento_directo: "Descuento directo",
  };

  function formatFecha(iso: string | null) {
    if (!iso) return "—";
    return iso.slice(0, 10);
  }

  function parseDias(diasJson: string | null): string {
    if (!diasJson) return "Todos los días";
    const dias: string[] = JSON.parse(diasJson);
    if (!dias.length) return "Todos los días";
    const labels: Record<string, string> = {
      lunes: "Lun", martes: "Mar", miercoles: "Mié",
      jueves: "Jue", viernes: "Vie", sabado: "Sáb", domingo: "Dom",
    };
    return dias.map((d) => labels[d] ?? d).join(", ");
  }

  return (
    <div style={{ padding: "32px 40px" }}>
      <Text style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--text1)", marginBottom: 24 }}>
        Configuración
      </Text>

      <Tabs defaultValue="medios">
        <Tabs.List mb={24}>
          <Tabs.Tab value="medios">Medios de pago</Tabs.Tab>
          <Tabs.Tab value="bancos">Bancos</Tabs.Tab>
          <Tabs.Tab value="descuentos">Descuentos especiales</Tabs.Tab>
          <Tabs.Tab value="promociones">Promociones bancarias</Tabs.Tab>
        </Tabs.List>

        {/* ── MEDIOS DE PAGO ─────────────────────────────────────────────── */}
        <Tabs.Panel value="medios">
          <Group justify="flex-end" mb={16}>
            <Button leftSection={<Plus size={16} />} onClick={() => { setEditMedio(null); setMedioError(null); setMedioModal(true); }}>
              Nuevo medio de pago
            </Button>
          </Group>
          <div style={TABLE_STYLE}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2, rgba(255,255,255,0.03))" }}>
                  {["Nombre", "Estado", "Acciones"].map((h) => <th key={h} style={TH_STYLE}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {medios.length === 0 && <EmptyRow cols={3} msg="No hay medios de pago" />}
                {medios.map((m) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid var(--border)", opacity: m.activo ? 1 : 0.5 }}>
                    <td style={TD_STYLE}>{m.nombre}</td>
                    <td style={{ ...TD_STYLE }}>
                      <Badge color={m.activo ? "green" : "gray"} variant="dot" size="sm">
                        {m.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td style={TD_STYLE}>
                      <Group gap={4}>
                        <ActionBtn tooltip="Editar" icon={<Pencil size={15} />} onClick={() => { setEditMedio(m); setMedioError(null); setMedioModal(true); }} />
                        <ActionBtn
                          tooltip={m.activo ? "Desactivar" : "Activar"}
                          icon={m.activo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          onClick={() => medioMutation.mutate({ id: m.id, data: { activo: !m.activo } as never })}
                        />
                        <ActionBtn
                          tooltip="Eliminar"
                          icon={<Trash2 size={15} />}
                          onClick={() => { if (confirm(`¿Eliminar "${m.nombre}"?`)) medioDeleteMutation.mutate(m.id); }}
                        />
                      </Group>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tabs.Panel>

        {/* ── BANCOS ────────────────────────────────────────────────────── */}
        <Tabs.Panel value="bancos">
          <Group justify="flex-end" mb={16}>
            <Button leftSection={<Plus size={16} />} onClick={() => { setEditBanco(null); setBancoError(null); setBancoModal(true); }}>
              Nuevo banco
            </Button>
          </Group>
          <div style={TABLE_STYLE}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2, rgba(255,255,255,0.03))" }}>
                  {["Nombre", "Estado", "Acciones"].map((h) => <th key={h} style={TH_STYLE}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {bancos.length === 0 && <EmptyRow cols={3} msg="No hay bancos" />}
                {bancos.map((b) => (
                  <tr key={b.id} style={{ borderBottom: "1px solid var(--border)", opacity: b.activo ? 1 : 0.5 }}>
                    <td style={TD_STYLE}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <BancoIcono icono={b.icono} size={18} />
                        {b.nombre}
                      </div>
                    </td>
                    <td style={TD_STYLE}>
                      <Badge color={b.activo ? "green" : "gray"} variant="dot" size="sm">
                        {b.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td style={TD_STYLE}>
                      <Group gap={4}>
                        <ActionBtn tooltip="Editar" icon={<Pencil size={15} />} onClick={() => { setEditBanco(b); setBancoError(null); setBancoModal(true); }} />
                        <ActionBtn
                          tooltip={b.activo ? "Desactivar" : "Activar"}
                          icon={b.activo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          onClick={() => bancoMutation.mutate({ id: b.id, data: { activo: !b.activo } as never })}
                        />
                        <ActionBtn
                          tooltip="Eliminar"
                          icon={<Trash2 size={15} />}
                          onClick={() => { if (confirm(`¿Eliminar "${b.nombre}"?`)) bancoDeleteMutation.mutate(b.id); }}
                        />
                      </Group>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tabs.Panel>

        {/* ── DESCUENTOS ────────────────────────────────────────────────── */}
        <Tabs.Panel value="descuentos">
          <Group justify="flex-end" mb={16}>
            <Button leftSection={<Plus size={16} />} onClick={() => { setEditDesc(null); setDescError(null); setDescModal(true); }}>
              Nuevo descuento
            </Button>
          </Group>
          <div style={TABLE_STYLE}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2, rgba(255,255,255,0.03))" }}>
                  {["Medio de pago", "Tipo", "Valor", "Alcance", "Vigencia", "Estado", "Acciones"].map((h) => <th key={h} style={TH_STYLE}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {descuentos.length === 0 && <EmptyRow cols={7} msg="No hay descuentos especiales" />}
                {descuentos.map((d) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid var(--border)", opacity: d.activo ? 1 : 0.5 }}>
                    <td style={TD_STYLE}>{d.medioPago.nombre}</td>
                    <td style={TD_STYLE}>{d.tipo === "porcentaje" ? "%" : "$"}</td>
                    <td style={TD_STYLE}>
                      {d.tipo === "porcentaje" ? `${Number(d.valor)}%` : `$${Number(d.valor).toLocaleString("es-AR")}`}
                    </td>
                    <td style={TD_STYLE}>
                      {d.alcance === "global"
                        ? <Badge variant="light" size="sm">Global</Badge>
                        : <Badge color="blue" variant="light" size="sm">{categorias.find((c) => c.id === d.categoriaOdooId)?.completeName ?? `Cat. #${d.categoriaOdooId}`}</Badge>
                      }
                    </td>
                    <td style={{ ...TD_STYLE, fontSize: 12, color: "var(--text3)" }}>
                      {formatFecha(d.vigenciaDesde)} → {formatFecha(d.vigenciaHasta)}
                    </td>
                    <td style={TD_STYLE}>
                      <Badge color={d.activo ? "green" : "gray"} variant="dot" size="sm">
                        {d.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td style={TD_STYLE}>
                      <Group gap={4}>
                        <ActionBtn tooltip="Editar" icon={<Pencil size={15} />} onClick={() => { setEditDesc(d); setDescError(null); setDescModal(true); }} />
                        <ActionBtn
                          tooltip={d.activo ? "Desactivar" : "Activar"}
                          icon={d.activo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          onClick={() => descMutation.mutate({ id: d.id, data: { activo: !d.activo } as never })}
                        />
                        <ActionBtn
                          tooltip="Eliminar"
                          icon={<Trash2 size={15} />}
                          onClick={() => { if (confirm("¿Eliminar este descuento?")) descDeleteMutation.mutate(d.id); }}
                        />
                      </Group>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tabs.Panel>

        {/* ── PROMOCIONES ───────────────────────────────────────────────── */}
        <Tabs.Panel value="promociones">
          <Group justify="flex-end" mb={16}>
            <Button leftSection={<Plus size={16} />} onClick={() => { setEditPromo(null); setPromoError(null); setPromoModal(true); }}>
              Nueva promoción
            </Button>
          </Group>
          <div style={TABLE_STYLE}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2, rgba(255,255,255,0.03))" }}>
                  {["Título", "Banco", "Tipo", "Detalle", "Días", "Vigencia", "Estado", "Acciones"].map((h) => <th key={h} style={TH_STYLE}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {promociones.length === 0 && <EmptyRow cols={8} msg="No hay promociones bancarias" />}
                {promociones.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--border)", opacity: p.activa ? 1 : 0.5 }}>
                    <td style={TD_STYLE}>
                      <div>{p.titulo}</div>
                      {p.marcaTarjeta && <div style={{ fontSize: 11, color: "var(--text3)" }}>{p.marcaTarjeta}</div>}
                    </td>
                    <td style={TD_STYLE}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {p.bancos.map((b) => (
                          <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <BancoIcono icono={b.icono} size={14} />
                            <span style={{ fontSize: 12 }}>{b.nombre}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td style={TD_STYLE}>{TIPO_LABEL[p.tipoBeneficio] ?? p.tipoBeneficio}</td>
                    <td style={{ ...TD_STYLE, fontSize: 12 }}>
                      {p.cantidadCuotas ? `${p.cantidadCuotas} cuotas` : ""}
                      {p.valorPorcentaje ? `${Number(p.valorPorcentaje)}%` : ""}
                      {p.topeReintegro ? ` (tope $${Number(p.topeReintegro).toLocaleString("es-AR")})` : ""}
                    </td>
                    <td style={{ ...TD_STYLE, fontSize: 12, color: "var(--text3)" }}>
                      {parseDias(p.diasAplicables)}
                    </td>
                    <td style={{ ...TD_STYLE, fontSize: 12, color: "var(--text3)" }}>
                      {formatFecha(p.vigenciaDesde)} → {formatFecha(p.vigenciaHasta)}
                    </td>
                    <td style={TD_STYLE}>
                      <Badge color={p.activa ? "green" : "gray"} variant="dot" size="sm">
                        {p.activa ? "Activa" : "Inactiva"}
                      </Badge>
                    </td>
                    <td style={TD_STYLE}>
                      <Group gap={4}>
                        <ActionBtn tooltip="Editar" icon={<Pencil size={15} />} onClick={() => { setEditPromo(p); setPromoError(null); setPromoModal(true); }} />
                        <ActionBtn
                          tooltip={p.activa ? "Desactivar" : "Activar"}
                          icon={p.activa ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          onClick={() => promoMutation.mutate({ id: p.id, data: { activa: !p.activa } as never })}
                        />
                        <ActionBtn
                          tooltip="Eliminar"
                          icon={<Trash2 size={15} />}
                          onClick={() => { if (confirm(`¿Eliminar "${p.titulo}"?`)) promoDeleteMutation.mutate(p.id); }}
                        />
                      </Group>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tabs.Panel>
      </Tabs>

      {/* ── modales ──────────────────────────────────────────────────────── */}
      <MedioPagoModal
        opened={medioModal}
        onClose={() => { setMedioModal(false); setEditMedio(null); setMedioError(null); }}
        onSave={(data) => medioMutation.mutate({ id: editMedio?.id, data: data as never })}
        item={editMedio}
        saving={medioMutation.isPending}
        error={medioError}
      />
      <BancoModal
        opened={bancoModal}
        onClose={() => { setBancoModal(false); setEditBanco(null); setBancoError(null); }}
        onSave={(data) => bancoMutation.mutate({ id: editBanco?.id, data: data as never })}
        item={editBanco}
        saving={bancoMutation.isPending}
        error={bancoError}
      />
      <DescuentoModal
        opened={descModal}
        onClose={() => { setDescModal(false); setEditDesc(null); setDescError(null); }}
        onSave={(data) => descMutation.mutate({ id: editDesc?.id, data: data as never })}
        item={editDesc}
        mediosPago={medios}
        categorias={categorias}
        saving={descMutation.isPending}
        error={descError}
      />
      <PromocionModal
        opened={promoModal}
        onClose={() => { setPromoModal(false); setEditPromo(null); setPromoError(null); }}
        onSave={(data: PromocionSaveData) => {
          // bancoIds[] — una sola promo con N bancos (many-to-many)
          promoMutation.mutate({ id: editPromo?.id, data: data as never });
        }}
        item={editPromo}
        bancos={bancos}
        saving={promoMutation.isPending}
        error={promoError}
      />
    </div>
  );
}
