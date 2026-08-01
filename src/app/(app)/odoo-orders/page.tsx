"use client";
import { useState } from "react";
import { Badge, Group, Select, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PaginationControls } from "@/components/ui/PaginationControls";
import { useOdooOrders } from "@/hooks/useOdooOrders";
import { usePagination } from "@/hooks/usePagination";
import type { Supplier } from "@/types";

const PAGE_SIZE = 30;

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Borrador", color: "gray" },
  sent: { label: "Enviada", color: "yellow" },
  purchase: { label: "Confirmada", color: "green" },
};

function formatDate(d: string) {
  if (!d) return "-";
  return d.split(" ")[0].split("-").reverse().join("/");
}

export default function OdooOrdersPage() {
  const pagination = usePagination(PAGE_SIZE);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);

  const { data, isLoading } = useOdooOrders({
    offset: pagination.offset,
    limit: PAGE_SIZE,
    supplierId: supplier?.id,
    state: stateFilter ?? undefined,
    dateFrom: dateFrom ? dateFrom.toISOString().split("T")[0] : undefined,
    dateTo: dateTo ? dateTo.toISOString().split("T")[0] : undefined,
  });

  const orders = data?.orders ?? [];

  return (
    <div style={{ padding: "24px 24px 80px" }}>
      {/* Header */}
      <Group justify="space-between" align="center" mb="xl">
        <div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text)" }}>
            Historial Odoo
          </h1>
          <Text size="xs" c="dimmed" mt={2}>
            Vista de solo lectura de órdenes en Odoo.
          </Text>
        </div>
      </Group>

      {/* Filters */}
      <Group mb="lg" gap="md" align="flex-end" wrap="wrap">
        <div>
          <Text size="xs" c="dimmed" fw={500} mb={4}>Proveedor</Text>
          <SupplierSearch
            value={supplier}
            onChange={(v) => { setSupplier(v); pagination.reset(); }}
          />
        </div>
        <Select
          label={<Text size="xs" c="dimmed" fw={500}>Estado</Text>}
          placeholder="Todos"
          data={[
            { value: "draft", label: "Borrador" },
            { value: "sent", label: "Enviada" },
            { value: "purchase", label: "Confirmada" },
          ]}
          value={stateFilter}
          onChange={(v) => { setStateFilter(v); pagination.reset(); }}
          clearable
          w={160}
          size="sm"
        />
        <DatePickerInput
          label={<Text size="xs" c="dimmed" fw={500}>Desde</Text>}
          value={dateFrom}
          onChange={(v) => { setDateFrom(v as Date | null); pagination.reset(); }}
          valueFormat="DD/MM/YYYY"
          locale="es"
          clearable
          w={150}
          size="sm"
        />
        <DatePickerInput
          label={<Text size="xs" c="dimmed" fw={500}>Hasta</Text>}
          value={dateTo}
          onChange={(v) => { setDateTo(v as Date | null); pagination.reset(); }}
          valueFormat="DD/MM/YYYY"
          locale="es"
          clearable
          w={150}
          size="sm"
        />
      </Group>

      {isLoading ? (
        <div style={{ display: "flex", gap: 8, padding: 48, justifyContent: "center", color: "var(--text2)" }}>
          <LoadingSpinner size={20} /> Cargando desde Odoo...
        </div>
      ) : orders.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "64px 24px",
            color: "var(--text3)",
            border: "1px dashed var(--border)",
            borderRadius: 8,
          }}
        >
          <Text size="sm">No hay órdenes</Text>
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-sans)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["N° Orden", "Proveedor", "Estado", "Fecha", "Total"].map((h) => (
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
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((row) => {
                  const cfg = STATE_LABELS[row.state] ?? { label: row.state, color: "gray" };
                  const proveedorName = Array.isArray(row.partner_id) ? row.partner_id[1] : "";
                  return (
                    <tr
                      key={row.id}
                      style={{ borderBottom: "1px solid var(--border)", transition: "background 120ms" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface2, rgba(255,255,255,0.03))"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <td style={{ padding: "12px 12px", color: "var(--text3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                        {row.name}
                      </td>
                      <td style={{ padding: "12px 12px", color: "var(--text)" }}>
                        {proveedorName}
                      </td>
                      <td style={{ padding: "12px 12px" }}>
                        <Badge color={cfg.color} variant="light" size="sm">{cfg.label}</Badge>
                      </td>
                      <td style={{ padding: "12px 12px", color: "var(--text3)", whiteSpace: "nowrap" }}>
                        {formatDate(row.date_order)}
                      </td>
                      <td style={{ padding: "12px 12px", color: "var(--text2)", fontFamily: "var(--font-mono)", textAlign: "right" }}>
                        ${row.amount_total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <PaginationControls
            total={data?.total ?? 0}
            offset={pagination.offset}
            limit={PAGE_SIZE}
            onNext={pagination.goNext}
            onPrev={pagination.goPrev}
            entityLabel={`orden${(data?.total ?? 0) !== 1 ? "es" : ""}`}
          />
        </>
      )}
    </div>
  );
}
