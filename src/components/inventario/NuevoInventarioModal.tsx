"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, Text, Group, Loader, Tooltip } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { useWarehouses } from "@/hooks/useWarehouses";
import { CategoryPicker } from "@/components/inventario/CategoryPicker";
import type { Warehouse } from "@/types";

interface NuevoInventarioModalProps {
  opened: boolean;
  onClose: () => void;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function NuevoInventarioModal({ opened, onClose }: NuevoInventarioModalProps) {
  const router = useRouter();
  const { data: warehouses = [], isLoading: wLoading } = useWarehouses();

  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [countDate, setCountDate] = useState<string | null>(todayStr());
  const [accountingDate, setAccountingDate] = useState<string | null>(todayStr());
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);

  const canSubmit =
    !!selectedWarehouse &&
    !!countDate &&
    !!accountingDate &&
    selectedCategories.length > 0 &&
    !creating;

  function handleClose() {
    if (creating) return;
    setSelectedWarehouse(null);
    setCountDate(todayStr());
    setAccountingDate(todayStr());
    setSelectedCategories([]);
    onClose();
  }

  async function handleStart() {
    if (!selectedWarehouse || !countDate || !accountingDate || selectedCategories.length === 0) return;
    setCreating(true);
    try {
      const res = await fetch("/api/inventario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: selectedWarehouse.id,
          warehouseName: selectedWarehouse.name,
          countDate,
          accountingDate,
        }),
      });
      const { id } = await res.json();
      onClose();
      // Pass selected category IDs as URL params for warmup on the scan page
      router.push(`/inventario/${id}?categories=${selectedCategories.join(",")}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Text fw={700} size="md" style={{ fontFamily: "var(--font-display)" }}>
          Nuevo Inventario
        </Text>
      }
      centered
      size="lg"
      overlayProps={{ blur: 2, backgroundOpacity: 0.55 }}
      closeOnClickOutside={!creating}
      closeOnEscape={!creating}
    >
      <div style={{ padding: "2px 0 12px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Fechas */}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px" }}>
            <Text
              size="xs"
              fw={600}
              c="dimmed"
              mb="sm"
              style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
            >
              Fecha de Conteo
            </Text>
            <DatePickerInput
              value={countDate ? new Date(countDate + "T12:00:00") : null}
              onChange={(v) =>
                setCountDate(v ? (v as unknown as Date).toISOString().slice(0, 10) : null)
              }
              valueFormat="DD/MM/YYYY"
              locale="es"
              clearable={false}
              size="sm"
            />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <Text
              size="xs"
              fw={600}
              c="dimmed"
              mb="sm"
              style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
            >
              Fecha Contable
            </Text>
            <DatePickerInput
              value={accountingDate ? new Date(accountingDate + "T12:00:00") : null}
              onChange={(v) =>
                setAccountingDate(v ? (v as unknown as Date).toISOString().slice(0, 10) : null)
              }
              valueFormat="DD/MM/YYYY"
              locale="es"
              clearable={false}
              size="sm"
            />
          </div>
        </div>

        {/* Depósito */}
        <div>
          <Text
            size="xs"
            fw={600}
            c="dimmed"
            mb="sm"
            style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
          >
            Depósito
          </Text>

          {wLoading ? (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                color: "var(--text3)",
                fontSize: 13,
              }}
            >
              <Loader size={14} color="gray" /> Cargando depósitos...
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {warehouses.map((wh) => {
                const active = selectedWarehouse?.id === wh.id;
                return (
                  <button
                    key={wh.id}
                    onClick={() => setSelectedWarehouse(wh)}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 8,
                      border: active
                        ? "2px solid var(--mantine-color-amber-6)"
                        : "1px solid var(--border)",
                      background: active
                        ? "color-mix(in srgb, var(--mantine-color-amber-6) 10%, transparent)"
                        : "var(--surface)",
                      color: active ? "var(--mantine-color-amber-4)" : "var(--text2)",
                      fontFamily: "var(--font-sans)",
                      fontSize: 14,
                      fontWeight: active ? 600 : 400,
                      cursor: "pointer",
                      transition: "border-color 120ms ease, background 120ms ease, color 120ms ease",
                      outline: "none",
                    }}
                    onMouseEnter={(e) => {
                      if (!active)
                        (e.currentTarget as HTMLElement).style.borderColor =
                          "var(--mantine-color-amber-8)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active)
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                    }}
                  >
                    {wh.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Categorías */}
        <CategoryPicker value={selectedCategories} onChange={setSelectedCategories} />
      </div>

      <Group
        justify="flex-end"
        gap="xs"
        pt="md"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <Button
          size="sm"
          variant="subtle"
          color="gray"
          onClick={handleClose}
          disabled={creating}
        >
          Cancelar
        </Button>
        <Tooltip
          label="Seleccioná al menos una categoría"
          withArrow
          disabled={selectedCategories.length > 0}
        >
          <Button
            size="sm"
            color="amber"
            loading={creating}
            disabled={!canSubmit}
            onClick={handleStart}
          >
            Comenzar Inventario
          </Button>
        </Tooltip>
      </Group>
    </Modal>
  );
}
