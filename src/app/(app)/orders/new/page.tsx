"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { Group, Text, Badge, Alert } from "@mantine/core";
import { useRouter } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { DatosCabeceraOrden } from "@/components/orders/DatosCabeceraOrden";
import { OrderStickyBar } from "@/components/orders/OrderStickyBar";
import { OrderGrid } from "@/components/orders/OrderGrid";
import { OrderFormFooter } from "@/components/orders/OrderFormFooter";
import { DraftWarningModal } from "@/components/orders/DraftWarningModal";
import { OrderProgressModal } from "@/components/orders/OrderProgressModal";
import { validateForConfirm } from "@/lib/orderValidation";
import { stripImagesForDB } from "@/lib/localOrders";
import type {
  Article,
  AttributeValue,
  Supplier,
  Warehouse,
  PrintColumn,
  PrintValues,
} from "@/types";

const ORDER_DRAFT_KEY = "order_new_draft";

function readDraft(): {
  supplier: Supplier | null;
  date: Date | null;
  globalBrand: AttributeValue | null;
  selectedWarehouses: Warehouse[];
  compradoras: { id: number; name: string }[];
  show: boolean;
} {
  const empty = {
    supplier: null,
    date: null,
    globalBrand: null,
    selectedWarehouses: [] as Warehouse[],
    compradoras: [] as { id: number; name: string }[],
    show: false,
  };
  try {
    const raw = localStorage.getItem(ORDER_DRAFT_KEY);
    if (!raw) return empty;
    const draft = JSON.parse(raw);
    const articles: unknown[] = Array.isArray(draft.articles) ? draft.articles : [];
    if (!draft.supplier || articles.length < 1) {
      localStorage.removeItem(ORDER_DRAFT_KEY);
      return empty;
    }
    return {
      supplier: draft.supplier ?? null,
      date: draft.date ? new Date(draft.date) : null,
      globalBrand: (draft.globalBrand as AttributeValue) ?? null,
      selectedWarehouses: Array.isArray(draft.selectedWarehouses)
        ? (draft.selectedWarehouses as Warehouse[])
        : [],
      compradoras: Array.isArray(draft.compradoras)
        ? (draft.compradoras as { id: number; name: string }[])
        : [],
      show: true,
    };
  } catch {
    return empty;
  }
}

export default function NewOrderPage() {
  const router = useRouter();
  // All state starts with SSR-safe defaults; draft is loaded client-side in useEffect
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [date, setDate] = useState<Date | null>(new Date());
  const [globalBrand, setGlobalBrand] = useState<AttributeValue | null>(null);
  const [compradoras, setCompradoras] = useState<{ id: number; name: string }[]>([]);
  const [draftBanner, setDraftBanner] = useState<boolean>(false);
  const [gridKey, setGridKey] = useState(0);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedWarehouses, setSelectedWarehouses] = useState<Warehouse[]>([]);
  const [printColumns, setPrintColumns] = useState<PrintColumn[]>([]);
  const [printValues, setPrintValues] = useState<PrintValues>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [progressStep, setProgressStep] = useState("Guardando borrador...");
  const [progressError, setProgressError] = useState<string | undefined>(
    undefined,
  );
  const [draftWarning, setDraftWarning] = useState<{
    open: boolean;
    warnings: string[];
  }>({
    open: false,
    warnings: [],
  });
  const [totals, setTotals] = useState({ units: 0, amount: 0 });
  const skipFirstSaveRef = useRef(true);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load draft from localStorage after hydration (client-only, avoids SSR mismatch)
  useEffect(() => {
    const draft = readDraft();
    if (draft.show) {
      setSupplier(draft.supplier);
      if (draft.date) setDate(draft.date);
      setGlobalBrand(draft.globalBrand);
      setSelectedWarehouses(draft.selectedWarehouses);
      if (draft.compradoras.length > 0) setCompradoras(draft.compradoras);
      setDraftBanner(true);
    }
    // Skip the first autosave tick since we just read from storage
    skipFirstSaveRef.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save supplier + date into draft — only if draft already exists OR conditions are met
  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      try {
        const raw = localStorage.getItem(ORDER_DRAFT_KEY);
        // Only create a new draft entry if supplier set + ≥1 article already in draft
        if (!raw) {
          const draftArticles = Array.isArray(articles) ? articles : [];
          if (!supplier || draftArticles.length < 1) return;
        }
        const current = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          ORDER_DRAFT_KEY,
          JSON.stringify({
            ...current,
            supplier,
            date: date?.toISOString() ?? null,
            compradoras,
            selectedWarehouses,
          }),
        );
      } catch {}
    }, 5000);
  }, [supplier, date, compradoras, selectedWarehouses, articles]);

  const handleTotalsChange = useCallback((units: number, amount: number) => {
    setTotals({ units, amount });
  }, []);

  const handleArticlesChange = useCallback((updated: Article[]) => {
    setArticles(updated);
  }, []);

  function discardDraft() {
    localStorage.removeItem(ORDER_DRAFT_KEY);
    setSupplier(null);
    setDate(new Date());
    setGlobalBrand(null);
    setCompradoras([]);
    setSelectedWarehouses([]);
    setDraftBanner(false);
    setGridKey((k) => k + 1);
  }

  const dateStr = date
    ? date.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  async function uploadPendingImages(orderId: string, currentArticles: typeof articles) {
    // Find images without tempPath (in-memory only, not yet on server)
    const updatedArticles = currentArticles.map((article) => ({ ...article, colorImages: { ...article.colorImages } }));

    for (const article of updatedArticles) {
      for (const [colorName, images] of Object.entries(article.colorImages)) {
        const pending = images.filter((img) => !img.tempPath && !img.isFromOdoo && img.base64);
        if (pending.length === 0) continue;

        const formData = new FormData();
        formData.append("articleId", article.id);
        formData.append("colorName", colorName);
        for (const img of pending) {
          const byteArray = Uint8Array.from(atob(img.base64), (c) => c.charCodeAt(0));
          const blob = new Blob([byteArray], { type: img.mimeType });
          formData.append("file", new File([blob], img.fileName, { type: img.mimeType }));
        }

        try {
          const res = await fetch(`/api/local-orders/${orderId}/images`, { method: "POST", body: formData });
          if (res.ok) {
            const data = await res.json() as { results: { imageId: string; tempPath: string }[] };
            let idx = 0;
            article.colorImages[colorName] = images.map((img) => {
              if (!img.tempPath && !img.isFromOdoo && img.base64 && data.results[idx]) {
                return { ...img, tempPath: data.results[idx++].tempPath };
              }
              return img;
            });
          }
        } catch {
          // best-effort
        }
      }
    }
    return updatedArticles;
  }

  async function doSaveDraft(): Promise<{ id: string } | null> {
    if (!supplier) return null;
    setIsSaving(true);
    try {
      const localArticles = stripImagesForDB(articles);
      const res = await fetch("/api/local-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplier.id,
          supplierName: supplier.name,
          brandId: globalBrand?.id ?? null,
          brandName: globalBrand?.name ?? null,
          compradoraIds: compradoras.map((c) => c.id),
          date: dateStr,
          articles: localArticles,
          warehouseIds: selectedWarehouses.map((w) => w.id),
          printColumns,
          printValues,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notifications.show({ color: "red", title: "Error al guardar", message: data?.error ?? "Error del servidor." });
        return null;
      }

      const { id } = data as { id: string };

      // Upload any in-memory images to server and update articles with tempPaths
      const updatedArticles = await uploadPendingImages(id, articles);
      const hasNewTempPaths = updatedArticles.some((a) =>
        Object.values(a.colorImages).some((imgs) => imgs.some((img) => img.tempPath)),
      );
      if (hasNewTempPaths) {
        await fetch(`/api/local-orders/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articles: stripImagesForDB(updatedArticles) }),
        });
      }

      localStorage.removeItem(ORDER_DRAFT_KEY);
      return data;
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaveDraft() {
    if (!supplier) {
      notifications.show({ color: "red", title: "Falta proveedor", message: "Seleccioná un proveedor antes de guardar." });
      return;
    }
    void doSaveDraft().then((data) => {
      if (data) {
        setSupplier(null);
        setDate(new Date());
        setGlobalBrand(null);
        setCompradoras([]);
        setSelectedWarehouses([]);
        setGridKey((k) => k + 1);
        setDraftBanner(false);
        notifications.show({
          color: "green",
          title: "Borrador guardado",
          message: "La orden fue guardada. El formulario está listo para una nueva OC.",
        });
      } else {
        notifications.show({ color: "red", title: "Error al guardar", message: "No se pudo guardar el borrador. Verificá los datos." });
      }
    }).catch(() => {
      notifications.show({ color: "red", title: "Error al guardar", message: "Ocurrió un error inesperado." });
    });
  }

  async function handleConfirm() {
    const localArticles = stripImagesForDB(articles);
    const validation = validateForConfirm({
      supplierId: supplier?.id ?? null,
      brandId: globalBrand?.id ?? null,
      compradoraIds: compradoras.map((c) => c.id),
      date: dateStr,
      articles: localArticles,
    });
    if (!validation.valid) {
      setDraftWarning({ open: true, warnings: validation.missing });
      return;
    }
    setProgressError(undefined);
    setProgressStep("Guardando borrador...");
    setIsConfirming(true);
    let errorOccurred = false;
    try {
      const savedDraft = await doSaveDraft();
      if (!savedDraft) {
        setProgressError(
          "No se pudo guardar el borrador. Verificá que el proveedor esté seleccionado.",
        );
        errorOccurred = true;
        return;
      }

      setProgressStep("Enviando a Odoo...");
      const confirmRes = await fetch(
        `/api/local-orders/${savedDraft.id}/confirm`,
        {
          method: "POST",
        },
      );
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        setProgressError(confirmData?.error ?? "Error al confirmar la orden.");
        errorOccurred = true;
        return;
      }

      router.push("/orders");
    } catch (err) {
      setProgressError(
        err instanceof Error ? err.message : "Error inesperado.",
      );
      errorOccurred = true;
    } finally {
      // On success, navigation handles unmount; on error, keep modal open for user to dismiss
      if (!errorOccurred) setIsConfirming(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        paddingBottom: 80,
      }}
    >
      <OrderStickyBar
        title="Nueva Orden de Compra"
        supplier={supplier}
        articles={articles}
        totalUnits={totals.units}
        totalAmount={totals.amount}
      />

      <div
        style={{ maxWidth: 1200, margin: "0 auto" }}
        className="page-inner-pad"
      >
        {/* Draft restore banner */}
        {draftBanner && (
          <Alert
            color="amber"
            variant="light"
            mb="md"
            title="Borrador restaurado"
            withCloseButton
            onClose={() => setDraftBanner(false)}
          >
            <Group gap="sm" align="center">
              <Text size="sm">
                Se recuperaron los datos de una sesión anterior.
              </Text>
              <button
                onClick={discardDraft}
                style={{
                  background: "none",
                  border: "1px solid var(--mantine-color-amber-5)",
                  borderRadius: 4,
                  cursor: "pointer",
                  color: "var(--mantine-color-amber-5)",
                  fontSize: 12,
                  padding: "2px 10px",
                }}
              >
                Descartar borrador
              </button>
            </Group>
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
          selectedWarehouses={selectedWarehouses}
          onSelectedWarehousesChange={setSelectedWarehouses}
        />

        {/* Order grid */}
        <OrderGrid
          key={gridKey}
          supplier={supplier}
          date={dateStr}
          onTotalsChange={handleTotalsChange}
          onArticlesChange={handleArticlesChange}
          onDraftCleared={() => setDraftBanner(false)}
          globalBrand={globalBrand}
          selectedWarehouses={selectedWarehouses}
          onPrintColumnsChange={setPrintColumns}
          onPrintValuesChange={setPrintValues}
        />
      </div>

      <OrderFormFooter
        onBack={() => router.push("/orders")}
        onSaveDraft={handleSaveDraft}
        isSaving={isSaving}
        isConfirming={isConfirming}
        showConfirm={false}
        isNewOrder
      />

      <DraftWarningModal
        opened={draftWarning.open}
        warnings={draftWarning.warnings}
        onCorrect={() => setDraftWarning({ open: false, warnings: [] })}
      />

      <OrderProgressModal
        opened={isConfirming}
        step={progressStep}
        error={progressError}
        onClose={progressError ? () => setIsConfirming(false) : undefined}
      />
    </div>
  );
}
