"use client";
import { useState, useCallback, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Group, Text, Badge, Alert } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { AlertTriangle } from "lucide-react";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { OrderGrid } from "@/components/orders/OrderGrid";
import { OrderFormFooter } from "@/components/orders/OrderFormFooter";
import { DraftWarningModal } from "@/components/orders/DraftWarningModal";
import { OrderProgressModal } from "@/components/orders/OrderProgressModal";
import { ErrorDetailModal } from "@/components/orders/ErrorDetailModal";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { stripImagesForDB } from "@/lib/localOrders";
import { validateForDraft, validateForConfirm } from "@/lib/orderValidation";
import type { Article, LocalOrder, Supplier } from "@/types";

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [totals, setTotals] = useState({ units: 0, amount: 0 });
  const handleTotalsChange = useCallback(
    (u: number, a: number) => setTotals({ units: u, amount: a }),
    [],
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [progressStep, setProgressStep] = useState("Guardando...");
  const [progressError, setProgressError] = useState<string | undefined>(undefined);

  const [draftWarning, setDraftWarning] = useState<{
    open: boolean;
    warnings: string[];
    mode: "draft" | "confirm";
  }>({ open: false, warnings: [], mode: "draft" });

  const [errorModal, setErrorModal] = useState(false);

  const isConfirmed = order?.status === "CONFIRMED";

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/local-orders/${id}`);
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error || "Error al cargar");
          return;
        }
        const loaded = data as LocalOrder;
        setOrder(loaded);
        setSupplier({ id: loaded.supplierId, name: loaded.supplierName });
        if (loaded.date) {
          const [y, m, d] = loaded.date.split("-").map(Number);
          setDate(new Date(y, m - 1, d));
        }
        setArticles(loaded.articles as unknown as Article[]);
      } catch {
        setLoadError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const dateStr = date
    ? date.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  async function doSaveDraft(): Promise<boolean> {
    setIsSaving(true);
    try {
      const localArticles = stripImagesForDB(articles);
      const res = await fetch(`/api/local-orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplier?.id,
          supplierName: supplier?.name,
          date: dateStr,
          articles: localArticles,
          warehouseIds: order?.warehouseIds ?? [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notifications.show({
          color: "red",
          title: "Error al guardar",
          message: data.error || "No se pudo guardar el borrador",
        });
        return false;
      }
      setOrder((prev) =>
        prev ? { ...prev, status: data.status ?? prev.status } : prev,
      );
      return true;
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaveDraft() {
    const localArticles = stripImagesForDB(articles);
    const validation = validateForDraft({
      supplierId: supplier?.id ?? null,
      date: dateStr,
      articles: localArticles,
    });
    if (!validation.valid) {
      setDraftWarning({ open: true, warnings: validation.missing, mode: "draft" });
      return;
    }
    void doSaveDraft().then((ok) => {
      if (ok) {
        notifications.show({
          color: "green",
          title: "Borrador guardado",
          message: "Los cambios fueron guardados correctamente",
        });
      }
    });
  }

  async function handleConfirm() {
    const localArticles = stripImagesForDB(articles);
    const validation = validateForConfirm({
      supplierId: supplier?.id ?? null,
      date: dateStr,
      articles: localArticles,
    });
    if (!validation.valid) {
      setDraftWarning({ open: true, warnings: validation.missing, mode: "confirm" });
      return;
    }

    setProgressError(undefined);
    setProgressStep("Guardando borrador...");
    setIsConfirming(true);
    let errorOccurred = false;
    try {
      const saved = await doSaveDraft();
      if (!saved) {
        setProgressError("No se pudo guardar el borrador antes de confirmar.");
        errorOccurred = true;
        return;
      }
      setProgressStep("Enviando a Odoo...");
      const res = await fetch(`/api/local-orders/${id}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setProgressError(data.error || "Error al confirmar la orden");
        setOrder((prev) =>
          prev
            ? { ...prev, status: "ERROR", errorDetail: data.error ?? null }
            : prev,
        );
        errorOccurred = true;
        return;
      }
      router.push("/orders");
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : "Error inesperado");
      errorOccurred = true;
    } finally {
      if (!errorOccurred) setIsConfirming(false);
    }
  }

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          gap: 12,
          color: "var(--text2)",
        }}
      >
        <LoadingSpinner size={24} /> Cargando orden...
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <Text c="red" size="sm" mb="md">
          {loadError}
        </Text>
        <Text
          size="sm"
          c="dimmed"
          style={{ cursor: "pointer" }}
          onClick={() => router.push("/orders")}
        >
          ← Volver a órdenes
        </Text>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", paddingBottom: 80 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 0" }}>
        <Text size="xs" c="dimmed" mb={4}>
          {order.status === "CONFIRMED"
            ? `Orden confirmada · ${order.odooOrderName}`
            : `Editando borrador #${order.id}`}
        </Text>

        {order.status === "ERROR" && (
          <Alert
            color="red"
            variant="light"
            mb="md"
            icon={<AlertTriangle size={16} />}
            title="Esta orden falló al confirmarse"
          >
            <Text size="sm">
              Revisá el error antes de reintentar.{" "}
              <span
                style={{ cursor: "pointer", textDecoration: "underline" }}
                onClick={() => setErrorModal(true)}
              >
                Ver detalle
              </span>
            </Text>
          </Alert>
        )}

        <Group gap="xl" mb="xs" align="flex-end" wrap="wrap">
          <div>
            <Text size="xs" c="dimmed" fw={500} mb={6}>
              Proveedor
            </Text>
            <SupplierSearch
              value={supplier}
              onChange={isConfirmed ? () => {} : setSupplier}
            />
          </div>
          <DatePickerInput
            label={
              <Text size="xs" c="dimmed" fw={500}>
                Fecha
              </Text>
            }
            value={date}
            onChange={isConfirmed ? () => {} : (v) => setDate(v as Date | null)}
            valueFormat="DD/MM/YYYY"
            locale="es"
            w={180}
            disabled={isConfirmed}
          />
          {totals.units > 0 && (
            <Badge color="amber" variant="light" size="md" style={{ marginLeft: "auto" }}>
              {totals.units} u.
            </Badge>
          )}
        </Group>

        <OrderGrid
          supplier={supplier}
          date={dateStr}
          onTotalsChange={handleTotalsChange}
          mode="edit"
          initialArticles={articles}
          orderId={order.id}
          onArticlesChange={setArticles}
        />
      </div>

      {!isConfirmed && (
        <OrderFormFooter
          onSaveDraft={handleSaveDraft}
          onConfirm={handleConfirm}
          onBack={() => router.push("/orders")}
          isSaving={isSaving}
          isConfirming={isConfirming}
        />
      )}

      {isConfirmed && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            padding: "12px 24px",
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <Text
            size="sm"
            c="dimmed"
            style={{ cursor: "pointer" }}
            onClick={() => router.push("/orders")}
          >
            ← Volver a órdenes
          </Text>
        </div>
      )}

      <DraftWarningModal
        opened={draftWarning.open}
        warnings={draftWarning.warnings}
        onCorrect={() => setDraftWarning((p) => ({ ...p, open: false }))}
        onSaveAnyway={
          draftWarning.mode === "draft"
            ? () => {
                setDraftWarning((p) => ({ ...p, open: false }));
                void doSaveDraft().then((ok) => {
                  if (ok) {
                    notifications.show({
                      color: "green",
                      title: "Borrador guardado",
                      message: "Los cambios fueron guardados correctamente",
                    });
                  }
                });
              }
            : () => setDraftWarning((p) => ({ ...p, open: false }))
        }
      />

      <OrderProgressModal
        opened={isConfirming}
        step={progressStep}
        error={progressError}
        onClose={
          progressError
            ? () => {
                setIsConfirming(false);
                setProgressError(undefined);
              }
            : undefined
        }
      />

      <ErrorDetailModal
        opened={errorModal}
        errorDetail={order.errorDetail ?? ""}
        onClose={() => setErrorModal(false)}
      />
    </div>
  );
}
