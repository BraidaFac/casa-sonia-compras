"use client";
import { useState, useEffect, useCallback } from "react";
import { Badge, Button, Group, Select, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Supplier } from "@/types";
import type { ColDef } from "ag-grid-community";

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

  const columnDefs: ColDef<OCSummary>[] = [
    { headerName: "N° Orden", field: "name", width: 130 },
    {
      headerName: "Proveedor",
      flex: 1,
      minWidth: 160,
      valueGetter: (p) => Array.isArray(p.data?.partner_id) ? p.data.partner_id[1] : "",
    },
    {
      headerName: "Estado",
      field: "state",
      width: 130,
      cellRenderer: (p: { value: string }) => {
        const cfg = STATE_LABELS[p.value] ?? { label: p.value, color: "gray" };
        return <Badge color={cfg.color} variant="light" size="sm">{cfg.label}</Badge>;
      },
    },
    { headerName: "Fecha", field: "date_order", width: 120, valueFormatter: (p) => formatDate(p.value) },
    {
      headerName: "Total",
      field: "amount_total",
      width: 140,
      type: "numericColumn",
      valueFormatter: (p) => `$${(p.value as number).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
    },
  ];

  return (
    <div style={{ padding: "24px 24px 80px" }}>
      <h1 style={{ margin: "0 0 20px", fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text)" }}>
        Historial Odoo
      </h1>
      <Text size="sm" c="dimmed" mb="lg">Vista de solo lectura de órdenes en Odoo.</Text>

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
          value={stateFilter} onChange={setStateFilter} clearable w={160} size="sm"
        />
        <DatePickerInput label={<Text size="xs" c="dimmed" fw={500}>Desde</Text>}
          value={dateFrom} onChange={(v) => setDateFrom(v as Date | null)}
          valueFormat="DD/MM/YYYY" locale="es" clearable w={150} size="sm" />
        <DatePickerInput label={<Text size="xs" c="dimmed" fw={500}>Hasta</Text>}
          value={dateTo} onChange={(v) => setDateTo(v as Date | null)}
          valueFormat="DD/MM/YYYY" locale="es" clearable w={150} size="sm" />
      </Group>

      {loading ? (
        <div style={{ display: "flex", gap: 8, padding: 48, justifyContent: "center", color: "var(--text2)" }}>
          <LoadingSpinner size={20} /> Cargando desde Odoo...
        </div>
      ) : (
        <>
          <OrdersTable rowData={orders} columnDefs={columnDefs} height={520} />
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
