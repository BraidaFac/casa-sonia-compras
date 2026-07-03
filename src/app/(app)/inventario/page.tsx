"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Group,
  Text,
  ActionIcon,
  Tooltip,
  Modal,
  Stack,
} from "@mantine/core";
import { CirclePlus, Plus, Eye, CheckCheck, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useInventories } from "@/hooks/useInventories";
import { useInventory } from "@/hooks/useInventory";
import { InventoryStatusBadge } from "@/components/inventario/InventoryStatusBadge";
import { NuevoInventarioModal } from "@/components/inventario/NuevoInventarioModal";
import { ResumenModal } from "@/components/inventario/ResumenModal";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { LocalInventorySummary } from "@/types";

const PAGE_SIZE = 30;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function InventarioPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<LocalInventorySummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resumenInvId, setResumenInvId] = useState<number | null>(null);

  const { data, isLoading } = useInventories({ limit: PAGE_SIZE, offset });

  const inventories = data?.data ?? [];
  const total = data?.total ?? 0;

  function handleConfirmar(inv: LocalInventorySummary) {
    setResumenInvId(inv.id);
  }

  function handleEliminar(inv: LocalInventorySummary) {
    setDeleteConfirm(inv);
  }

  async function executeDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await fetch(`/api/inventario/${deleteConfirm.id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["inventories"] });
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ padding: "24px 24px 80px" }}>
      {/* Header */}
      <Group justify="space-between" align="center" mb="xl">
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text)",
            }}
          >
            Inventario
          </h1>
          <Text size="xs" c="dimmed" mt={2}>
            {total} inventario{total !== 1 ? "s" : ""} registrado{total !== 1 ? "s" : ""}
          </Text>
        </div>
        <Tooltip label="Nuevo Inventario" withArrow position="left">
          <ActionIcon
            color="amber"
            variant="filled"
            size="lg"
            onClick={() => setNuevoOpen(true)}
            aria-label="Nuevo Inventario"
          >
            <CirclePlus size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Table */}
      {isLoading ? (
        <div style={{ display: "flex", gap: 8, padding: 48, justifyContent: "center", color: "var(--text2)" }}>
          <LoadingSpinner size={20} /> Cargando...
        </div>
      ) : inventories.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "64px 24px",
            color: "var(--text3)",
            border: "1px dashed var(--border)",
            borderRadius: 8,
          }}
        >
          <Text size="sm" mb={8}>No hay inventarios registrados</Text>
          <Button
            size="xs"
            variant="subtle"
            color="amber"
            leftSection={<Plus size={14} />}
            onClick={() => setNuevoOpen(true)}
          >
            Crear el primero
          </Button>
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                fontFamily: "var(--font-sans)",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["#", "Depósito", "Estado", "Artículos", "Fecha Conteo", "Acciones"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 12px",
                          textAlign: "left",
                          color: "var(--text3)",
                          fontWeight: 500,
                          fontSize: 11,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {inventories.map((inv) => (
                  <tr
                    key={inv.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      transition: "background 120ms",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--surface2, rgba(255,255,255,0.03))";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <td style={{ padding: "12px 12px", color: "var(--text3)" }}>
                      #{inv.id}
                    </td>
                    <td style={{ padding: "12px 12px", color: "var(--text)" }}>
                      {inv.warehouseName}
                    </td>
                    <td style={{ padding: "12px 12px" }}>
                      <InventoryStatusBadge status={inv.status} />
                    </td>
                    <td style={{ padding: "12px 12px", color: "var(--text2)" }}>
                      {inv.articleCount}
                    </td>
                    <td style={{ padding: "12px 12px", color: "var(--text3)", whiteSpace: "nowrap" }}>
                      {inv.countDate ? inv.countDate.split("-").reverse().join("/") : formatDate(inv.createdAt)}
                    </td>
                    <td style={{ padding: "12px 12px" }}>
                      <Group gap={4} wrap="nowrap">
                        <Tooltip label="Ver detalle" withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            onClick={() => router.push(`/inventario/${inv.id}`)}
                          >
                            <Eye size={14} />
                          </ActionIcon>
                        </Tooltip>

                        {inv.status === "BORRADOR" && (
                          <Tooltip
                            label={inv.articleCount === 0 ? "Sin artículos — no se puede confirmar" : "Confirmar / Aplicar"}
                            withArrow
                          >
                            <ActionIcon
                              variant="subtle"
                              color="green"
                              size="sm"
                              disabled={inv.articleCount === 0}
                              onClick={() => handleConfirmar(inv)}
                            >
                              <CheckCheck size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}

                        <Tooltip label="Eliminar" withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            onClick={() => handleEliminar(inv)}
                          >
                            <Trash2 size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <Group justify="space-between" mt="md">
            <Text size="xs" c="dimmed">
              {total} inventario{total !== 1 ? "s" : ""}
            </Text>
            <Group gap="xs">
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                ← Anterior
              </Button>
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                Siguiente →
              </Button>
            </Group>
          </Group>
        </>
      )}

      {/* Nuevo inventario modal */}
      <NuevoInventarioModal opened={nuevoOpen} onClose={() => setNuevoOpen(false)} />

      {/* Resumen modal (revision / confirmar) */}
      {resumenInvId !== null && (
        <ResumenModalFetcher
          invId={resumenInvId}
          onClose={() => setResumenInvId(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["inventories"] });
            setResumenInvId(null);
          }}
        />
      )}

      {/* Delete confirm modal */}
      <Modal
        opened={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="Eliminar Inventario"
        centered
        size="sm"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            ¿Estás seguro de eliminar el inventario <strong>#{deleteConfirm?.id}</strong>?
            Esta acción no tiene vuelta atrás.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" color="gray" size="sm" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button color="red" size="sm" loading={deleting} onClick={executeDelete}>
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}

// Wrapper que fetchea el inventario completo para pasarlo al ResumenModal
function ResumenModalFetcher({
  invId,
  onClose,
  onSuccess,
}: {
  invId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { data: inventory, isLoading } = useInventory(invId);

  if (isLoading || !inventory) return null;

  return (
    <ResumenModal
      opened
      onClose={onClose}
      inventory={inventory}
      articles={inventory.articles}
      onSuccess={onSuccess}
    />
  );
}
