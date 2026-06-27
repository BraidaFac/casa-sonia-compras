"use client";
import { useState, useCallback, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { Group, Text, Badge, Button, Modal, Stack, ThemeIcon, List } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { CheckCircle, Clock, FileText, Loader2 } from "lucide-react";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { OrderGrid } from "@/components/orders/OrderGrid";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Article, ArticleRow, OrderHeader, Supplier } from "@/types";

interface LoadedOrder {
  order: OrderHeader;
  articles: Article[];
}

interface DiffSummary {
  newArticles: string[];
  modifiedArticles: string[];
  willCreate: number;
  willUpdate: number;
  willDelete: number;
  headerChanged: boolean;
  hasChanges: boolean;
}

function computeDiff(
  articles: Article[],
  snapshot: Article[],
  currentSupplier: Supplier | null,
  originalOrder: OrderHeader,
  date: Date | null,
): DiffSummary {
  let willCreate = 0,
    willUpdate = 0,
    willDelete = 0;
  const newArticles: string[] = [];
  const modifiedSet = new Set<string>();

  const snapshotLineIds = new Set<number>();
  for (const snapArt of snapshot) {
    for (const row of snapArt.rows) {
      if (row.odooLineIds) {
        for (const lineId of Object.values(row.odooLineIds)) snapshotLineIds.add(lineId);
      }
    }
  }

  const seenLineIds = new Set<number>();

  for (const article of articles) {
    if (!article.existingProductId) {
      newArticles.push(article.name);
      for (const row of article.rows) {
        for (const size of article.sizes) {
          if (parseInt(row.quantities[size.name] || "0") > 0) willCreate++;
        }
      }
      continue;
    }
    const snapArt = snapshot.find((s) => s.existingProductId === article.existingProductId);
    for (const row of article.rows) {
      for (const size of article.sizes) {
        const qty = parseInt(row.quantities[size.name] || "0");
        const price = article.priceGranular
          ? parseFloat(row.prices?.[size.name] || article.price) || 0
          : parseFloat(article.price) || 0;
        const lineId = row.odooLineIds?.[size.name];
        if (lineId) {
          seenLineIds.add(lineId);
          if (qty <= 0) {
            willDelete++;
            modifiedSet.add(article.name);
          } else {
            const snapRow = snapArt?.rows.find(
              (r: ArticleRow) => r.odooLineIds?.[size.name] === lineId,
            );
            const snapQty = parseInt(snapRow?.quantities[size.name] || "0");
            const snapPrice = article.priceGranular
              ? parseFloat(snapRow?.prices?.[size.name] || snapArt?.price || "0") || 0
              : parseFloat(snapArt?.price || "0") || 0;
            if (qty !== snapQty || price !== snapPrice) {
              willUpdate++;
              modifiedSet.add(article.name);
            }
          }
        } else if (qty > 0) {
          willCreate++;
          modifiedSet.add(article.name);
        }
      }
    }
  }

  for (const snapLineId of snapshotLineIds) {
    if (!seenLineIds.has(snapLineId)) willDelete++;
  }

  const headerChanged =
    currentSupplier?.id !== originalOrder.supplierId ||
    (date ? date.toISOString().split("T")[0] !== originalOrder.date : false);

  const modifiedArticles = [...modifiedSet].filter((n) => !newArticles.includes(n));
  const hasChanges =
    willCreate > 0 ||
    willUpdate > 0 ||
    willDelete > 0 ||
    newArticles.length > 0 ||
    headerChanged;

  return {
    newArticles,
    modifiedArticles,
    willCreate,
    willUpdate,
    willDelete,
    headerChanged,
    hasChanges,
  };
}

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loadedData, setLoadedData] = useState<LoadedOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Controlled header state — initialized from loaded order
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [totals, setTotals] = useState({ units: 0, amount: 0 });
  const handleTotalsChange = useCallback((units: number, amount: number) => {
    setTotals({ units, amount });
  }, []);

  // Diff modal state
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<DiffSummary | null>(null);
  const confirmRef = useRef<((v: boolean) => void) | null>(null);

  // Progress modal state
  const [saveInProgress, setSaveInProgress] = useState(false);
  const [progressStep, setProgressStep] = useState(0); // 0, 1, 2

  // Result modal state
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const resultResolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/orders/${id}`);
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error || "Error al cargar la orden");
          return;
        }
        const loaded = data as LoadedOrder;
        setLoadedData(loaded);
        setSupplier({ id: loaded.order.supplierId, name: loaded.order.supplierName });
        if (loaded.order.date) {
          const [year, month, day] = loaded.order.date.split("-").map(Number);
          setDate(new Date(year, month - 1, day));
        }
      } catch {
        setLoadError("Error de conexión al cargar la orden");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Progress step timer
  useEffect(() => {
    if (!saveInProgress) {
      setProgressStep(0);
      return;
    }
    const t1 = setTimeout(() => setProgressStep(1), 3500);
    const t2 = setTimeout(() => setProgressStep(2), 7000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [saveInProgress]);

  const dateStr = date
    ? date.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          color: "var(--text2)",
        }}
      >
        <LoadingSpinner size={24} />
        Cargando orden...
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <Text c="red" size="sm">
          {loadError}
        </Text>
        <Button variant="subtle" color="gray" onClick={() => router.push("/orders")}>
          Volver a órdenes
        </Button>
      </div>
    );
  }

  if (!loadedData) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "0 0 60px" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

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
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            color: "var(--text)",
          }}
        >
          Editando {loadedData.order.name}
        </h1>

        {(supplier || totals.units > 0) && (
          <Group gap="sm" ml="auto" wrap="nowrap">
            {supplier && (
              <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                {supplier.name}
              </Text>
            )}
            {totals.units > 0 && (
              <>
                <Badge color="amber" variant="light" size="md">
                  {totals.units} u.
                </Badge>
                <Badge color="amber" variant="outline" size="md">
                  $
                  {totals.amount.toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Badge>
              </>
            )}
          </Group>
        )}
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 0" }}>
        {saveError && (
          <Text c="red" size="sm" mb="sm">
            {saveError}
          </Text>
        )}

        {/* Supplier + Date bar */}
        <Group gap="xl" mb="xs" align="flex-end" wrap="wrap">
          <div>
            <Text size="xs" c="dimmed" fw={500} mb={6}>
              Proveedor
            </Text>
            <SupplierSearch value={supplier} onChange={setSupplier} />
          </div>

          <DatePickerInput
            label={
              <Text size="xs" c="dimmed" fw={500}>
                Fecha
              </Text>
            }
            value={date}
            onChange={(val) => setDate(val as Date | null)}
            valueFormat="DD/MM/YYYY"
            locale="es"
            w={180}
          />

          {supplier && (
            <Badge
              color="amber"
              variant="outline"
              size="lg"
              style={{ marginLeft: "auto" }}
            >
              {supplier.name}
            </Badge>
          )}
        </Group>

        {/* Order grid in edit mode */}
        <OrderGrid
          supplier={supplier}
          date={dateStr}
          onTotalsChange={handleTotalsChange}
          mode="edit"
          initialArticles={loadedData.articles}
          orderId={loadedData.order.id}
          initialWarehouseIds={loadedData.order.warehouseIds}
          onArticlesChange={(_articles) => {
            // Task 15 will implement the save-draft flow here
          }}
        />
      </div>

      {/* Diff confirmation modal */}
      <Modal
        opened={diffModalOpen}
        onClose={() => {
          confirmRef.current?.(false);
          setDiffModalOpen(false);
        }}
        title={<Text fw={600}>Confirmar cambios</Text>}
        centered
        size="sm"
      >
        {pendingDiff && (
          <Stack gap="md">
            {!pendingDiff.hasChanges ? (
              <Text size="sm" c="dimmed">
                No hay cambios para guardar.
              </Text>
            ) : (
              <>
                <List size="sm" spacing="xs">
                  {pendingDiff.newArticles.length > 0 && (
                    <List.Item>
                      <Text size="sm">
                        <Text span fw={500} c="green">
                          Artículos nuevos:
                        </Text>{" "}
                        {pendingDiff.newArticles.join(", ")}
                      </Text>
                    </List.Item>
                  )}
                  {pendingDiff.modifiedArticles.length > 0 && (
                    <List.Item>
                      <Text size="sm">
                        <Text span fw={500} c="amber">
                          Artículos modificados:
                        </Text>{" "}
                        {pendingDiff.modifiedArticles.join(", ")}
                      </Text>
                    </List.Item>
                  )}
                  {pendingDiff.willCreate > 0 && (
                    <List.Item>
                      <Text size="sm">
                        Líneas nuevas:{" "}
                        <Text span fw={500}>
                          {pendingDiff.willCreate}
                        </Text>
                      </Text>
                    </List.Item>
                  )}
                  {pendingDiff.willUpdate > 0 && (
                    <List.Item>
                      <Text size="sm">
                        Líneas a actualizar:{" "}
                        <Text span fw={500}>
                          {pendingDiff.willUpdate}
                        </Text>
                      </Text>
                    </List.Item>
                  )}
                  {pendingDiff.willDelete > 0 && (
                    <List.Item>
                      <Text size="sm" c="red">
                        Líneas a eliminar:{" "}
                        <Text span fw={500}>
                          {pendingDiff.willDelete}
                        </Text>
                      </Text>
                    </List.Item>
                  )}
                  {pendingDiff.headerChanged && (
                    <List.Item>
                      <Text size="sm">Cambios en encabezado de orden</Text>
                    </List.Item>
                  )}
                </List>
              </>
            )}
            <Group justify="flex-end" gap="sm">
              <Button
                variant="subtle"
                color="gray"
                onClick={() => {
                  confirmRef.current?.(false);
                  setDiffModalOpen(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                color="amber"
                disabled={!pendingDiff.hasChanges}
                onClick={() => {
                  confirmRef.current?.(true);
                  setDiffModalOpen(false);
                }}
              >
                Confirmar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Progress modal */}
      <Modal
        opened={saveInProgress}
        onClose={() => {}}
        withCloseButton={false}
        centered
        size="sm"
        title={<Text fw={600}>Guardando orden...</Text>}
      >
        <Stack gap="md" py="sm">
          {[
            "Actualizando productos y líneas",
            "Regenerando PDF de la orden",
            "Registrando cambios en Odoo",
          ].map((label, i) => {
            const done = progressStep > i;
            const active = progressStep === i;
            return (
              <Group key={i} gap="sm">
                {done ? (
                  <ThemeIcon color="green" variant="light" size="sm" radius="xl">
                    <CheckCircle size={12} />
                  </ThemeIcon>
                ) : active ? (
                  <ThemeIcon color="amber" variant="light" size="sm" radius="xl">
                    <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                  </ThemeIcon>
                ) : (
                  <ThemeIcon color="gray" variant="light" size="sm" radius="xl">
                    <Clock size={12} />
                  </ThemeIcon>
                )}
                <Text size="sm" c={done ? "dimmed" : active ? "text" : "dimmed"}>
                  {label}
                </Text>
              </Group>
            );
          })}
        </Stack>
      </Modal>

      {/* Result modal */}
      <Modal
        opened={resultModalOpen}
        onClose={() => {
          resultResolveRef.current?.();
          setResultModalOpen(false);
        }}
        title={<Text fw={600}>Cambios guardados</Text>}
        centered
        size="sm"
      >
        <Stack gap="md">
          <Group gap="sm">
            <ThemeIcon color="green" variant="light" size="md" radius="xl">
              <CheckCircle size={16} />
            </ThemeIcon>
            <Text size="sm">La orden fue actualizada correctamente en Odoo.</Text>
          </Group>
          <Group gap="sm" justify="flex-end">
            {pdfName && (
              <Button
                variant="light"
                color="amber"
                leftSection={<FileText size={14} />}
                component="a"
                href={`/api/orders/${id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Descargar PDF
              </Button>
            )}
            <Button
              color="amber"
              onClick={() => {
                resultResolveRef.current?.();
                setResultModalOpen(false);
              }}
            >
              Volver a órdenes
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
