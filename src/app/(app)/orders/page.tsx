"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Text,
  Group,
  Select,
  Modal,
  Stack,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import {
  Plus,
  Send,
  Copy,
  Trash2,
  Edit2,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { ConfirmModal } from "@/components/orders/ConfirmModal";
import { ErrorDetailModal } from "@/components/orders/ErrorDetailModal";
import { ValidationErrorModal } from "@/components/orders/ValidationErrorModal";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { LocalOrderSummary, LocalOrder, OrderStatus, Supplier } from "@/types";
import { validateForConfirm } from "@/lib/orderValidation";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

const PAGE_SIZE = 30;

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  DRAFT: { label: "Borrador", color: "blue" },
  CONFIRMED: { label: "Confirmada", color: "green" },
  ERROR: { label: "Error", color: "red" },
};

function formatDate(d: string) {
  if (!d) return "-";
  return d.split("T")[0].split("-").reverse().join("/");
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<LocalOrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);

  const [errorModal, setErrorModal] = useState<{
    open: boolean;
    detail: string | null;
  }>({
    open: false,
    detail: null,
  });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [duplicating, setDuplicating] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ order: LocalOrder } | null>(null);
  const [validationModal, setValidationModal] = useState<{ warnings: string[]; orderId: number } | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (supplier) params.set("supplier_id", String(supplier.id));
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom)
        params.set("date_from", dateFrom.toISOString().split("T")[0]);
      if (dateTo) params.set("date_to", dateTo.toISOString().split("T")[0]);
      const res = await fetch(`/api/local-orders?${params}`);
      const json = await res.json();
      setOrders(json.data ?? []);
      setTotal(json.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [supplier, statusFilter, dateFrom, dateTo, offset]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrders();
  }, [fetchOrders]);

  async function handleConfirm(id: number) {
    setConfirming(id);
    try {
      const res = await fetch(`/api/local-orders/${id}`);
      if (!res.ok) {
        notifications.show({ color: "red", title: "Error", message: "No se pudo cargar la orden" });
        return;
      }
      const order: LocalOrder = await res.json();

      const validation = validateForConfirm({
        supplierId: order.supplierId,
        brandId: order.brandId,
        compradoraIds: order.compradoraIds ?? [],
        date: order.date,
        articles: order.articles as import("@/types").Article[],
      });
      if (!validation.valid) {
        setValidationModal({ warnings: validation.missing, orderId: id });
        return;
      }

      setConfirmModal({ order });
    } finally {
      setConfirming(null);
    }
  }

  async function handleDuplicate(id: number) {
    setDuplicating(id);
    try {
      const res = await fetch(`/api/local-orders/${id}/duplicate`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) router.push(`/orders/${data.id}/edit`);
    } finally {
      setDuplicating(null);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      await fetch(`/api/local-orders/${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      fetchOrders();
    } finally {
      setDeleting(null);
    }
  }

  const columnDefs: ColDef<LocalOrderSummary>[] = [
    {
      headerName: "Creada",
      field: "createdAt",
      width: 120,
      valueFormatter: (p) => formatDate(p.value as string),
    },
    {
      headerName: "Proveedor",
      field: "supplierName",
      flex: 1,
      minWidth: 160,
    },
    {
      headerName: "Estado",
      field: "status",
      width: 130,
      cellRenderer: (p: ICellRendererParams<LocalOrderSummary>) => {
        const cfg = STATUS_CONFIG[p.value as OrderStatus] ?? {
          label: p.value,
          color: "gray",
        };
        return (
          <Badge color={cfg.color} variant="light" size="sm">
            {cfg.label}
          </Badge>
        );
      },
    },
    {
      headerName: "Artículos",
      field: "articleCount",
      width: 100,
      type: "numericColumn",
    },
    {
      headerName: "Fecha OC",
      field: "date",
      width: 120,
      valueFormatter: (p) =>
        p.value ? (p.value as string).split("-").reverse().join("/") : "-",
    },
    {
      headerName: "N° Odoo",
      field: "odooOrderName",
      width: 130,
      valueFormatter: (p) => (p.value as string | null) ?? "-",
    },
    {
      headerName: "Acciones",
      width: 180,
      sortable: false,
      cellRenderer: (p: ICellRendererParams<LocalOrderSummary>) => {
        const row = p.data!;
        return (
          <Group gap={4} wrap="nowrap" align="center" h="100%">
            {row.status === "ERROR" && (
              <Tooltip label="Ver error" withArrow>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  onClick={() =>
                    setErrorModal({ open: true, detail: row.errorDetail })
                  }
                >
                  <AlertTriangle size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            {(row.status === "DRAFT" || row.status === "ERROR") && (
              <Tooltip label="Editar" withArrow>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="amber"
                  onClick={() => router.push(`/orders/${row.id}/edit`)}
                >
                  <Edit2 size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            {row.status === "DRAFT" && (
              <Tooltip label="Confirmar" withArrow>
                <ActionIcon
                  size="sm"
                  variant="filled"
                  color="amber"
                  loading={confirming === row.id}
                  onClick={() => handleConfirm(row.id)}
                >
                  <Send size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            {row.status === "CONFIRMED" && (
              <Tooltip label="Ver" withArrow>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={() => router.push(`/orders/${row.id}/edit`)}
                >
                  <Eye size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label="Duplicar" withArrow>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                loading={duplicating === row.id}
                onClick={() => handleDuplicate(row.id)}
              >
                <Copy size={14} />
              </ActionIcon>
            </Tooltip>
            {(row.status === "DRAFT" || row.status === "ERROR") && (
              <Tooltip label="Eliminar" withArrow>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  onClick={() => setDeleteConfirm(row.id)}
                >
                  <Trash2 size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        );
      },
    },
  ];

  return (
    <div className="page-pad">
      {/* Header */}
      <Group justify="space-between" align="center" mb="lg">
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          Órdenes
        </h1>
        <Button
          leftSection={<Plus size={14} />}
          color="amber"
          size="sm"
          onClick={() => router.push("/orders/new")}
        >
          Nueva Orden
        </Button>
      </Group>

      {/* Filters */}
      <Group mb="lg" gap="md" align="flex-end" wrap="wrap">
        <div>
          <Text size="xs" c="dimmed" fw={500} mb={4}>
            Proveedor
          </Text>
          <SupplierSearch value={supplier} onChange={setSupplier} />
        </div>
        <Select
          label={
            <Text size="xs" c="dimmed" fw={500}>
              Estado
            </Text>
          }
          placeholder="Todos"
          data={[
            { value: "DRAFT", label: "Borrador" },
            { value: "CONFIRMED", label: "Confirmada" },
            { value: "ERROR", label: "Error" },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
          clearable
          w={160}
          size="sm"
        />
        <DatePickerInput
          label={
            <Text size="xs" c="dimmed" fw={500}>
              Desde
            </Text>
          }
          value={dateFrom}
          onChange={(v) => setDateFrom(v as Date | null)}
          valueFormat="DD/MM/YYYY"
          locale="es"
          clearable
          w={150}
          size="sm"
        />
        <DatePickerInput
          label={
            <Text size="xs" c="dimmed" fw={500}>
              Hasta
            </Text>
          }
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
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: 48,
            justifyContent: "center",
            color: "var(--text2)",
          }}
        >
          <LoadingSpinner size={20} /> Cargando...
        </div>
      ) : (
        <>
          <OrdersTable rowData={orders} columnDefs={columnDefs} height={520} />
          <Group justify="space-between" mt="md">
            <Text size="xs" c="dimmed">
              {total} orden{total !== 1 ? "es" : ""}
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

      <ErrorDetailModal
        opened={errorModal.open}
        errorDetail={errorModal.detail ?? ""}
        onClose={() => setErrorModal({ open: false, detail: null })}
      />

      {confirmModal && (
        <ConfirmModal
          orderId={confirmModal.order.id}
          supplier={{ id: confirmModal.order.supplierId, name: confirmModal.order.supplierName }}
          date={confirmModal.order.date}
          articles={confirmModal.order.articles as import("@/types").Article[]}
          selectedWarehouses={(confirmModal.order.warehouseIds as number[]).map((id) => ({ id, name: "", code: "" }))}
          printColumns={(confirmModal.order.printColumns as import("@/types").PrintColumn[]) ?? []}
          printValues={(confirmModal.order.printValues as import("@/types").PrintValues) ?? {}}
          onClose={() => setConfirmModal(null)}
          onConfirmed={() => { setConfirmModal(null); fetchOrders(); }}
        />
      )}

      <ValidationErrorModal
        opened={validationModal !== null}
        onClose={() => setValidationModal(null)}
        warnings={validationModal?.warnings ?? []}
        onEdit={() => {
          router.push(`/orders/${validationModal!.orderId}/edit`);
          setValidationModal(null);
        }}
      />

      <Modal
        opened={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title={<Text fw={600}>Eliminar borrador</Text>}
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            ¿Eliminás este borrador? Esta acción no se puede deshacer.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              color="gray"
              onClick={() => setDeleteConfirm(null)}
            >
              Cancelar
            </Button>
            <Button
              color="red"
              loading={deleting !== null}
              onClick={() =>
                deleteConfirm !== null && handleDelete(deleteConfirm)
              }
            >
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
