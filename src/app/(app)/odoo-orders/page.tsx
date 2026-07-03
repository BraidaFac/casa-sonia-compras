"use client";
import { useState, useEffect, useCallback } from "react";
import { Badge, Button, Group, Select, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Supplier } from "@/types";

const PAGE_SIZE = 30;

interface OCSummary {
  id: number;
  name: string;
  partner_id: [number, string];
  state: string;
  date_order: string;
  amount_total: number;
}

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
  const [orders, setOrders] = useState<OCSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (supplier) params.set("supplier_id", String(supplier.id));
      if (stateFilter) params.set("state", stateFilter);
      if (dateFrom) params.set("date_from", dateFrom.toISOString().split("T")[0]);
      if (dateTo) params.set("date_to", dateTo.toISOString().split("T")[0]);
      const res = await fetch(`/api/orders?${params}`);
      const data = await res.json();
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [supplier, stateFilter, dateFrom, dateTo, offset]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrders();
  }, [fetchOrders]);

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
          <SupplierSearch value={supplier} onChange={setSupplier} />
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
          onChange={setStateFilter}
          clearable
          w={160}
          size="sm"
        />
        <DatePickerInput
          label={<Text size="xs" c="dimmed" fw={500}>Desde</Text>}
          value={dateFrom}
          onChange={(v) => setDateFrom(v as Date | null)}
          valueFormat="DD/MM/YYYY"
          locale="es"
          clearable
          w={150}
          size="sm"
        />
        <DatePickerInput
          label={<Text size="xs" c="dimmed" fw={500}>Hasta</Text>}
          value={dateTo}
          onChange={(v) => setDateTo(v as Date | null)}
          valueFormat="DD/MM/YYYY"
          locale="es"
          clearable
          w={150}
          size="sm"
        />
      </Group>

      {loading ? (
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

          <Group justify="space-between" mt="md">
            <Text size="xs" c="dimmed">{total} orden{total !== 1 ? "es" : ""}</Text>
            <Group gap="xs">
              <Button variant="subtle" color="gray" size="xs" disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
                ← Anterior
              </Button>
              <Button variant="subtle" color="gray" size="xs" disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}>
                Siguiente →
              </Button>
            </Group>
          </Group>
        </>
      )}
    </div>
  );
}
