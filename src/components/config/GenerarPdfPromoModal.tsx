"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Modal, Button, Group, Text, Checkbox, Stack, Divider, ScrollArea } from "@mantine/core";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { GripVertical, FileDown, Loader2 } from "lucide-react";
import type { PromoVigente, DescuentoVigente } from "@/lib/configPricing";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PdfItemKind = "promo" | "descuento";

interface OrderItem {
  kind: PdfItemKind;
  id: number;
  label: string;
  sub: string;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  promosHoy: PromoVigente[];
  promosOtrosDias: PromoVigente[];
  promosProximas: PromoVigente[];
  descuentos: DescuentoVigente[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function promoLabel(p: PromoVigente): string {
  return p.bancos.map((b) => b.nombre).join(" · ") || p.titulo;
}

function promoSub(p: PromoVigente): string {
  switch (p.tipoBeneficio) {
    case "cuotas_sin_interes":   return `${p.cantidadCuotas} cuotas sin interés`;
    case "cuotas_con_interes":   return `${p.cantidadCuotas} cuotas con interés`;
    case "reintegro":            return `${Number(p.valorPorcentaje)}% reintegro`;
    case "descuento_directo":    return `${Number(p.valorPorcentaje)}% descuento`;
    case "cuotas_con_descuento": return `${p.cantidadCuotas}c + ${Number(p.valorPorcentaje)}% desc.`;
    case "cuotas_con_reintegro": return `${p.cantidadCuotas}c + ${Number(p.valorPorcentaje)}% reintegro`;
    default: return p.tipoBeneficio;
  }
}

function descuentoLabel(d: DescuentoVigente): string {
  return (d as unknown as { nombre?: string }).nombre || d.medioPago.nombre;
}

function descuentoSub(d: DescuentoVigente): string {
  const val = d.tipo === "porcentaje"
    ? `${Number(d.valor)}% descuento`
    : `$${Number(d.valor).toLocaleString("es-AR")} fijo`;
  if (d.alcance !== "global") {
    const cat = d.categoriaNombre ? d.categoriaNombre.split(" / ").at(-1) : "categoría";
    return `${val} · ${cat}`;
  }
  return val;
}

function toOrderItem(kind: PdfItemKind, item: PromoVigente | DescuentoVigente): OrderItem {
  if (kind === "promo") {
    const p = item as PromoVigente;
    return { kind, id: p.id, label: promoLabel(p), sub: promoSub(p) };
  }
  const d = item as DescuentoVigente;
  return { kind, id: d.id, label: descuentoLabel(d), sub: descuentoSub(d) };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GenerarPdfPromoModal({ opened, onClose, promosHoy, promosOtrosDias, promosProximas, descuentos }: Props) {
  const [selectedPromos, setSelectedPromos] = useState<Set<number>>(new Set());
  const [selectedProximas, setSelectedProximas] = useState<Set<number>>(new Set());
  const [selectedDescuentos, setSelectedDescuentos] = useState<Set<number>>(new Set());
  const [ordered, setOrdered] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Reset on open
  useEffect(() => {
    if (!opened) return;
    const promoIds = new Set([...promosHoy, ...promosOtrosDias].map((p) => p.id));
    const descIds  = new Set(descuentos.map((d) => d.id));
    setSelectedPromos(promoIds);
    setSelectedProximas(new Set());
    setSelectedDescuentos(descIds);
    setOrdered([
      ...promosHoy.map((p) => toOrderItem("promo", p)),
      ...promosOtrosDias.map((p) => toOrderItem("promo", p)),
      ...descuentos.map((d) => toOrderItem("descuento", d)),
    ]);
  }, [opened, promosHoy, promosOtrosDias, promosProximas, descuentos]);

  // Sync ordered list when selection changes
  function syncOrdered(
    newPromos: Set<number>,
    newProximas: Set<number>,
    newDescuentos: Set<number>,
  ) {
    setOrdered((prev) => {
      // Remove deselected
      const filtered = prev.filter((item) => {
        if (item.kind === "promo") return newPromos.has(item.id) || newProximas.has(item.id);
        return newDescuentos.has(item.id);
      });
      // Add newly selected that aren't already in the list
      const inList = new Set(filtered.map((i) => `${i.kind}-${i.id}`));
      const toAdd: OrderItem[] = [];
      for (const id of newPromos) {
        if (!inList.has(`promo-${id}`)) {
          const p = promosHoy.find((x) => x.id === id) ?? promosOtrosDias.find((x) => x.id === id);
          if (p) toAdd.push(toOrderItem("promo", p));
        }
      }
      for (const id of newProximas) {
        if (!inList.has(`promo-${id}`)) {
          const p = promosProximas.find((x) => x.id === id);
          if (p) toAdd.push(toOrderItem("promo", p));
        }
      }
      for (const id of newDescuentos) {
        if (!inList.has(`descuento-${id}`)) {
          const d = descuentos.find((x) => x.id === id);
          if (d) toAdd.push(toOrderItem("descuento", d));
        }
      }
      return [...filtered, ...toAdd];
    });
  }

  function togglePromo(id: number) {
    const next = new Set(selectedPromos);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedPromos(next);
    syncOrdered(next, selectedProximas, selectedDescuentos);
  }

  function toggleProxima(id: number) {
    const next = new Set(selectedProximas);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedProximas(next);
    syncOrdered(selectedPromos, next, selectedDescuentos);
  }

  function toggleDescuento(id: number) {
    const next = new Set(selectedDescuentos);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedDescuentos(next);
    syncOrdered(selectedPromos, selectedProximas, next);
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const items = Array.from(ordered);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setOrdered(items);
  }

  async function handleGenerar() {
    if (ordered.length === 0 || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/pdf-promociones/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: ordered.map((i) => ({ kind: i.kind, id: i.id })) }),
      });
      if (!res.ok) {
        console.error("[GenerarPdfPromoModal] Error:", await res.text());
        return;
      }
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      const url  = URL.createObjectURL(blob);
      window.open(url, "_blank");
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const canGenerar = ordered.length > 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Generar PDF de promociones"
      size="xl"
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, minHeight: 400 }}>

        {/* ── Left: Selection ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.06em" }}>
            Selección
          </Text>

          <ScrollArea h={400} offsetScrollbars>
            <Stack gap={4}>

              {/* Promos vigentes hoy */}
              {promosHoy.length > 0 && (
                <>
                  <Text size="xs" fw={600} c="dimmed" mb={2}>Vigentes hoy</Text>
                  {promosHoy.map((p) => (
                    <Checkbox
                      key={p.id}
                      checked={selectedPromos.has(p.id)}
                      onChange={() => togglePromo(p.id)}
                      label={
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{promoLabel(p)}</div>
                          <div style={{ fontSize: 11, color: "var(--mantine-color-dimmed)" }}>{promoSub(p)}</div>
                        </div>
                      }
                      styles={{ body: { alignItems: "flex-start" }, input: { marginTop: 2 } }}
                    />
                  ))}
                </>
              )}

              {/* Promos otros días */}
              {promosOtrosDias.length > 0 && (
                <>
                  <Divider my={8} />
                  <Text size="xs" fw={600} c="dimmed" mb={2}>Otros días</Text>
                  {promosOtrosDias.map((p) => (
                    <Checkbox
                      key={p.id}
                      checked={selectedPromos.has(p.id)}
                      onChange={() => togglePromo(p.id)}
                      label={
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{promoLabel(p)}</div>
                          <div style={{ fontSize: 11, color: "var(--mantine-color-dimmed)" }}>{promoSub(p)}</div>
                        </div>
                      }
                      styles={{ body: { alignItems: "flex-start" }, input: { marginTop: 2 } }}
                    />
                  ))}
                </>
              )}

              {/* Promos próximas */}
              {promosProximas.length > 0 && (
                <>
                  <Divider my={8} />
                  <Text size="xs" fw={600} c="dimmed" mb={2}>Próximas</Text>
                  {promosProximas.map((p) => (
                    <Checkbox
                      key={p.id}
                      checked={selectedProximas.has(p.id)}
                      onChange={() => toggleProxima(p.id)}
                      label={
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{promoLabel(p)}</div>
                          <div style={{ fontSize: 11, color: "var(--mantine-color-dimmed)" }}>{promoSub(p)}</div>
                        </div>
                      }
                      styles={{ body: { alignItems: "flex-start" }, input: { marginTop: 2 } }}
                    />
                  ))}
                </>
              )}

              {/* Descuentos */}
              {descuentos.length > 0 && (
                <>
                  <Divider my={8} />
                  <Text size="xs" fw={600} c="dimmed" mb={2}>Descuentos especiales</Text>
                  {descuentos.map((d) => (
                    <Checkbox
                      key={d.id}
                      checked={selectedDescuentos.has(d.id)}
                      onChange={() => toggleDescuento(d.id)}
                      label={
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{descuentoLabel(d)}</div>
                          <div style={{ fontSize: 11, color: "var(--mantine-color-dimmed)" }}>{descuentoSub(d)}</div>
                        </div>
                      }
                      styles={{ body: { alignItems: "flex-start" }, input: { marginTop: 2 } }}
                    />
                  ))}
                </>
              )}

            </Stack>
          </ScrollArea>
        </div>

        {/* ── Right: Order ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.06em" }}>
            Orden en el PDF ({ordered.length})
          </Text>

          <ScrollArea h={400} offsetScrollbars>
            {ordered.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" mt="xl">
                Seleccioná al menos un ítem
              </Text>
            ) : (
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="pdf-order">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}>
                      {ordered.map((item, index) => (
                        <Draggable
                          key={`${item.kind}-${item.id}`}
                          draggableId={`${item.kind}-${item.id}`}
                          index={index}
                        >
                          {(prov, snapshot) => {
                            const el = (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "7px 10px",
                                marginBottom: 4,
                                borderRadius: 8,
                                width: 300,
                                background: snapshot.isDragging
                                  ? "var(--mantine-color-dark-5)"
                                  : item.kind === "descuento"
                                  ? "color-mix(in srgb, var(--mantine-color-teal-9) 30%, var(--mantine-color-dark-6))"
                                  : "var(--mantine-color-dark-6)",
                                border: `1px solid ${item.kind === "descuento" ? "var(--mantine-color-teal-8)" : "var(--mantine-color-dark-4)"}`,
                                cursor: "grab",
                                boxShadow: snapshot.isDragging ? "0 4px 12px rgba(0,0,0,0.3)" : "none",
                                ...prov.draggableProps.style,
                              }}
                            >
                              <span
                                {...prov.dragHandleProps}
                                style={{ color: "var(--mantine-color-dimmed)", display: "flex", flexShrink: 0 }}
                              >
                                <GripVertical size={14} />
                              </span>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {item.label}
                                </div>
                                <div style={{ fontSize: 10, color: "var(--mantine-color-dimmed)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {item.sub}
                                </div>
                              </div>
                              <span style={{
                                fontSize: 9,
                                fontWeight: 700,
                                letterSpacing: "0.05em",
                                textTransform: "uppercase",
                                color: item.kind === "descuento" ? "var(--mantine-color-teal-4)" : "var(--mantine-color-dimmed)",
                                flexShrink: 0,
                              }}>
                                {item.kind === "descuento" ? "desc." : "promo"}
                              </span>
                            </div>
                            );
                            return snapshot.isDragging ? createPortal(el, document.body) : el;
                          }}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </ScrollArea>
        </div>

      </div>

      <Group justify="flex-end" mt="lg">
        <Button variant="subtle" onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button
          color="amber"
          leftSection={loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <FileDown size={14} />}
          onClick={handleGenerar}
          loading={loading}
          disabled={!canGenerar}
        >
          {loading ? "Generando..." : "Abrir vista previa"}
        </Button>
      </Group>
    </Modal>
  );
}
