"use client";
import { useState, useCallback, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Text, Badge, Alert } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { AlertTriangle } from "lucide-react";
import { DatosCabeceraOrden } from "@/components/orders/DatosCabeceraOrden";
import { OrderGrid } from "@/components/orders/OrderGrid";
import { OrderFormFooter } from "@/components/orders/OrderFormFooter";
import { OrderStickyBar } from "@/components/orders/OrderStickyBar";
import { ConfirmModal } from "@/components/orders/ConfirmModal";
import { DraftWarningModal } from "@/components/orders/DraftWarningModal";
import { OrderProgressModal } from "@/components/orders/OrderProgressModal";
import { ErrorDetailModal } from "@/components/orders/ErrorDetailModal";
import { ResumenModal } from "@/components/orders/ResumenModal";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { stripImagesForDB } from "@/lib/localOrders";
import { validateForConfirm } from "@/lib/orderValidation";
import { getMissingRequiredFamilies } from "@/lib/required-attrs";
import type {
  Article,
  AttributeValue,
  ColorImages,
  LocalOrder,
  Supplier,
  PrintColumn,
  PrintValues,
  Warehouse,
} from "@/types";

export default function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
  const [progressStep] = useState("Guardando...");
  const [progressError, setProgressError] = useState<string | undefined>(
    undefined,
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  // Track OrderGrid internal state for ConfirmModal
  const [printColumns, setPrintColumns] = useState<PrintColumn[]>([]);
  const [printValues, setPrintValues] = useState<PrintValues>({});
  const [selectedWarehouses, setSelectedWarehouses] = useState<Warehouse[]>([]);
  const [globalBrand, setGlobalBrand] = useState<AttributeValue | null>(null);
  const [compradoras, setCompradoras] = useState<{ id: number; name: string }[]>([]);

  const [draftWarning, setDraftWarning] = useState<{
    open: boolean;
    warnings: string[];
    mode: "draft" | "confirm";
  }>({ open: false, warnings: [], mode: "draft" });

  const [errorModal, setErrorModal] = useState(false);
  const [resumenOpen, setResumenOpen] = useState(false);

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
        if (loaded.brandId && loaded.brandName) {
          setGlobalBrand({ id: loaded.brandId, name: loaded.brandName });
        }
        // compradoraIds hydrated in DatosCabeceraOrden via initialCompradoraIds
        if (loaded.date) {
          const [y, m, d] = loaded.date.split("-").map(Number);
          setDate(new Date(y, m - 1, d));
        }
        let loadedArticles = loaded.articles as unknown as Article[];

        // Fetch Odoo images BEFORE setting state so OrderGrid mounts with correct images.
        // (OrderGrid only reads initialArticles once on mount — background updates are ignored.)
        const articlesWithProduct = loadedArticles.filter((a) => a.existingProductId);
        if (articlesWithProduct.length > 0) {
          const imageResults = await Promise.allSettled(
            articlesWithProduct.map(async (article) => {
              const imgRes = await fetch(
                `/api/products/${article.existingProductId}/images`,
              );
              if (!imgRes.ok) return null;
              const colorImages = (await imgRes.json()) as ColorImages;
              if (Object.keys(colorImages).length === 0) return null;
              return { articleId: article.id, colorImages };
            }),
          );
          const imageMap = new Map<string, ColorImages>();
          for (const r of imageResults) {
            if (r.status === "fulfilled" && r.value) {
              imageMap.set(r.value.articleId, r.value.colorImages);
            }
          }
          if (imageMap.size > 0) {
            loadedArticles = loadedArticles.map((a) => {
              const colorImages = imageMap.get(a.id);
              return colorImages ? { ...a, colorImages } : a;
            });
          }
        }

        setArticles(loadedArticles);
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

  async function doSaveDraft(silent = false): Promise<boolean> {
    setIsSaving(true);
    try {
      const localArticles = stripImagesForDB(articles);
      const res = await fetch(`/api/local-orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplier?.id,
          supplierName: supplier?.name,
          brandId: globalBrand?.id ?? null,
          brandName: globalBrand?.name ?? null,
          compradoraIds: compradoras.map((c) => c.id),
          date: dateStr,
          articles: localArticles,
          warehouseIds: selectedWarehouses.map((w) => w.id),
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
      if (!silent) {
        notifications.show({
          color: "green",
          title: "Borrador guardado",
          message: "Los cambios fueron guardados correctamente.",
        });
      }
      return true;
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaveDraft() {
    void doSaveDraft().then((ok) => {
      if (ok) {
        router.push("/orders");
      }
    });
  }

  async function handleConfirm() {
    const localArticles = stripImagesForDB(articles);

    // Check required attributes — activates red highlights in OrderGrid
    const attrWarnings: string[] = [];
    for (const article of articles) {
      const label = article.name || "(artículo sin nombre)";
      const missing = getMissingRequiredFamilies(article.attributes ?? []);
      for (const f of missing)
        attrWarnings.push(`"${label}": falta atributo "${f.label}"`);
    }
    if (attrWarnings.length > 0) {
      setShowValidation(true);
      setDraftWarning({ open: true, warnings: attrWarnings, mode: "confirm" });
      return;
    }

    const validation = validateForConfirm({
      supplierId: supplier?.id ?? null,
      brandId: globalBrand?.id ?? null,
      compradoraIds: compradoras.map((c) => c.id),
      date: dateStr,
      articles: localArticles,
    });
    if (!validation.valid) {
      setDraftWarning({
        open: true,
        warnings: validation.missing,
        mode: "confirm",
      });
      return;
    }

    // Save draft first, then open ConfirmModal for review
    setProgressError(undefined);
    setIsConfirming(true);
    try {
      const saved = await doSaveDraft(true);
      if (!saved) {
        setProgressError("No se pudo guardar el borrador antes de confirmar.");
        return;
      }
      setIsConfirming(false);
      setShowConfirmModal(true);
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setIsConfirming(false);
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
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        paddingBottom: 80,
      }}
    >
      <OrderStickyBar
        title={
          order.status === "CONFIRMED"
            ? `Orden confirmada · ${order.odooOrderName}`
            : `Editando borrador #${order.id}`
        }
        supplier={supplier}
        articles={articles}
        totalUnits={totals.units}
        totalAmount={totals.amount}
        onBack={() => router.push("/orders")}
        onOpenResumen={() => setResumenOpen(true)}
      />
      <ResumenModal
        opened={resumenOpen}
        onClose={() => setResumenOpen(false)}
        articles={articles}
      />
      <div
        style={{ maxWidth: 1200, margin: "0 auto" }}
        className="page-inner-pad"
      >
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

        <DatosCabeceraOrden
          supplier={supplier}
          onSupplierChange={setSupplier}
          date={date}
          onDateChange={(v) => setDate(v)}
          globalBrand={globalBrand}
          onGlobalBrandChange={setGlobalBrand}
          compradoras={compradoras}
          onCompradorasChange={setCompradoras}
          initialCompradoraIds={order.compradoraIds as number[]}
          selectedWarehouses={selectedWarehouses}
          onSelectedWarehousesChange={setSelectedWarehouses}
          initialWarehouseIds={order.warehouseIds as number[]}
          disabled={isConfirmed}
          extraContent={
            totals.units > 0 ? (
              <Badge
                color="amber"
                variant="light"
                size="md"
                style={{ marginLeft: "auto" }}
              >
                {totals.units} u.
              </Badge>
            ) : null
          }
        />

        <OrderGrid
          supplier={supplier}
          date={dateStr}
          onTotalsChange={handleTotalsChange}
          mode="edit"
          initialArticles={articles}
          orderId={order.id}
          onArticlesChange={setArticles}
          globalBrand={globalBrand}
          selectedWarehouses={selectedWarehouses}
          onPrintColumnsChange={setPrintColumns}
          onPrintValuesChange={setPrintValues}
          showValidation={showValidation}
          readOnly={isConfirmed}
        />
      </div>

      {!isConfirmed && (
        <OrderFormFooter
          onSaveDraft={handleSaveDraft}
          onConfirm={handleConfirm}
          onBack={() => router.push("/orders")}
          isSaving={isSaving}
          isConfirming={isConfirming}
          showConfirm={true}
        />
      )}

      {isConfirmed && (
        <div
          className="footer-bar-pad"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
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

      {showConfirmModal && supplier && (
        <ConfirmModal
          orderId={order.id}
          supplier={supplier}
          date={dateStr}
          articles={articles}
          selectedWarehouses={selectedWarehouses}
          printColumns={printColumns}
          printValues={printValues}
          onClose={() => setShowConfirmModal(false)}
          onConfirmed={() => router.push("/orders")}
        />
      )}

      <ErrorDetailModal
        opened={errorModal}
        errorDetail={order.errorDetail ?? ""}
        onClose={() => setErrorModal(false)}
      />
    </div>
  );
}
