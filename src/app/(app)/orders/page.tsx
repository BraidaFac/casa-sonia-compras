"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Group, Select, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { Plus, Edit2, ChevronLeft, ChevronRight } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
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

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  return dateStr.split(" ")[0].split("-").reverse().join("/");
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function OrdersListPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OCSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [offset, setOffset] = useState(0);

  // Track previous filter values to detect changes and reset offset
  const filtersRef = useRef({ supplier, stateFilter, dateFrom, dateTo });

  const fetchOrders = useCallback(async (currentOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (supplier) params.set("supplier_id", String(supplier.id));
      if (stateFilter) params.set("state", stateFilter);
      if (dateFrom) params.set("date_from", dateFrom.toISOString().split("T")[0]);
      if (dateTo) params.set("date_to", dateTo.toISOString().split("T")[0]);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(currentOffset));

      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar órdenes");
      const data = await res.json();
      setOrders(data.orders || []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [supplier, stateFilter, dateFrom, dateTo]);

  // Reset offset when filters change
  useEffect(() => {
    const prev = filtersRef.current;
    const filtersChanged =
      prev.supplier !== supplier ||
      prev.stateFilter !== stateFilter ||
      prev.dateFrom !== dateFrom ||
      prev.dateTo !== dateTo;

    if (filtersChanged) {
      filtersRef.current = { supplier, stateFilter, dateFrom, dateTo };
      setOffset(0);
      fetchOrders(0);
    } else {
      fetchOrders(offset);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier, stateFilter, dateFrom, dateTo, offset]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "0 0 60px" }}>
      {/* Header */}
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <img src="/CS.png" alt="Casa Sonia" style={{ height: 32, width: "auto", flexShrink: 0 }} />
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            color: "var(--text)",
          }}
        >
          Órdenes de Compra
        </h1>
        <Button
          leftSection={<Plus size={14} />}
          color="amber"
          size="sm"
          style={{ marginLeft: "auto" }}
          onClick={() => router.push("/orders/new")}
        >
          Nueva Orden
        </Button>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px" }}>
        {/* Filters */}
        <Group mb="lg" gap="md" align="flex-end" wrap="wrap">
          <div>
            <Text size="xs" c="dimmed" fw={500} mb={4}>
              Proveedor
            </Text>
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

        {/* Content */}
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 48, color: "var(--text2)", justifyContent: "center" }}>
            <LoadingSpinner size={20} />
            Cargando órdenes...
          </div>
        ) : error ? (
          <div style={{ padding: 24, color: "var(--red)", fontSize: 14 }}>{error}</div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text3)", fontSize: 14 }}>
            No hay órdenes que coincidan con los filtros.
          </div>
        ) : (
          <>
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {/* Table header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 120px 120px 140px 100px",
                  gap: 16,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface2, var(--surface))",
                }}
              >
                {["N° Orden", "Proveedor", "Estado", "Fecha", "Total", ""].map((h) => (
                  <Text key={h} size="xs" c="dimmed" fw={600} style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {h}
                  </Text>
                ))}
              </div>

              {/* Rows */}
              {orders.map((order) => {
                const stateInfo = STATE_LABELS[order.state] || { label: order.state, color: "gray" };
                const supplierName = Array.isArray(order.partner_id) ? order.partner_id[1] : "";
                return (
                  <div
                    key={order.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px 1fr 120px 120px 140px 100px",
                      gap: 16,
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--border)",
                      alignItems: "center",
                    }}
                  >
                    <Text size="sm" fw={600} style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                      {order.name}
                    </Text>
                    <Text size="sm" c="dimmed" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {supplierName}
                    </Text>
                    <Badge color={stateInfo.color} variant="light" size="sm">
                      {stateInfo.label}
                    </Badge>
                    <Text size="sm" c="dimmed">
                      {formatDate(order.date_order)}
                    </Text>
                    <Text size="sm" style={{ fontFamily: "var(--font-mono)" }}>
                      ${formatAmount(order.amount_total)}
                    </Text>
                    <Button
                      variant="subtle"
                      color="amber"
                      size="xs"
                      leftSection={<Edit2 size={12} />}
                      onClick={() => router.push(`/orders/${order.id}/edit`)}
                    >
                      Editar
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <Group justify="space-between" mt="md" align="center">
              <Text size="xs" c="dimmed">
                {total} orden{total !== 1 ? "es" : ""} · página {currentPage} de {totalPages || 1}
              </Text>
              <Group gap="xs">
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  leftSection={<ChevronLeft size={14} />}
                  disabled={!hasPrev}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                >
                  Anterior
                </Button>
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  rightSection={<ChevronRight size={14} />}
                  disabled={!hasNext}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                >
                  Siguiente
                </Button>
              </Group>
            </Group>
          </>
        )}
      </div>
    </div>
  );
}
