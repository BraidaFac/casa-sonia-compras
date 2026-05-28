"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Modal,
  Table,
  Button,
  Text,
  Group,
  Stack,
  Loader,
  Textarea,
} from "@mantine/core";
import { CheckCircle } from "lucide-react";
import type { Article, Supplier, PrintColumn, PrintValues, Warehouse } from "@/types";

interface Props {
  supplier: Supplier;
  date: string;
  articles: Article[];
  selectedWarehouses: Warehouse[];
  printColumns: PrintColumn[];
  printValues: PrintValues;
  onClose: () => void;
  onConfirmed: () => void;
  onValidationError: (errors: { articleName: string; type: "color" | "size"; value: string }[]) => void;
}

interface ImageSyncEntry {
  articleId: string;
  templateId: number;
  resolvedColors: { id: number; name: string }[];
  variantMap: [string, number][];
}

interface OrderResult {
  purchaseOrderId: number;
  purchaseOrderName: string;
  imageSyncData?: ImageSyncEntry[];
}

interface OrderError {
  error: string;
  createdProductIds?: number[];
  validationErrors?: { articleName: string; type: "color" | "size"; value: string }[];
}

async function createOrder(body: {
  supplierId: number;
  date: string;
  articles: Article[];
  warehouseIds: number[];
  printColumns: import("@/types").PrintColumn[];
  printValues: import("@/types").PrintValues;
  selectedWarehouses: import("@/types").Warehouse[];
}): Promise<OrderResult> {
  // Strip image data to avoid Vercel 4.5MB payload limit
  const articlesStripped = body.articles.map((a) => ({
    ...a,
    colorImages: {},
    deletedOdooImageIds: [],
    clearedPrimaryColorNames: [],
  }));

  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, articles: articlesStripped }),
  });

  if (!res.ok) {
    const err: OrderError = await res.json();
    throw err;
  }

  return res.json();
}

async function syncImagesAfterOrder(
  articles: Article[],
  imageSyncData: ImageSyncEntry[],
): Promise<void> {
  for (const entry of imageSyncData) {
    const article = articles.find((a) => a.id === entry.articleId);
    if (!article) continue;

    // Build lean colorImages: strip previewUrl from all images, strip base64 from
    // Odoo images (already in Odoo — server doesn't need to re-upload them).
    // This avoids Vercel's 4.5MB payload limit when products have many/large Odoo images.
    const colorImagesLean: Record<string, object[]> = {};
    for (const [colorName, images] of Object.entries(article.colorImages || {})) {
      colorImagesLean[colorName] = images.map((img) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { previewUrl, base64, ...rest } = img;
        return img.isFromOdoo
          ? { ...rest, base64: "" }        // Odoo image: strip data, keep flags
          : { ...rest, base64 };            // New image: keep base64, drop previewUrl
      });
    }

    const hasImages =
      Object.values(colorImagesLean).some((imgs) =>
        imgs.some((img: object) => (img as { base64?: string }).base64),
      ) ||
      (article.deletedOdooImageIds?.length ?? 0) > 0 ||
      (article.clearedPrimaryColorNames?.length ?? 0) > 0;

    if (!hasImages) continue;

    try {
      const res = await fetch(`/api/products/${entry.templateId}/sync-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colorImages: colorImagesLean,
          deletedOdooImageIds: article.deletedOdooImageIds || [],
          clearedPrimaryColorNames: article.clearedPrimaryColorNames || [],
          resolvedColors: entry.resolvedColors,
          variantMap: entry.variantMap,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`Image sync failed for article ${entry.articleId}: ${res.status}`, errText);
      }
    } catch (err) {
      console.error(`Error syncing images for article ${entry.articleId}:`, err);
    }
  }
}

function calcArticleSummary(article: Article, warehouseMode: boolean) {
  let units = 0;
  let amount = 0;
  const variantSet = new Set<string>();

  if (warehouseMode) {
    for (const row of article.rows) {
      for (const [key, val] of Object.entries(row.warehouseQuantities || {})) {
        const qty = parseInt(val || "0", 10);
        if (qty <= 0) continue;
        units += qty;
        const sizeName = key.split(":").slice(1).join(":");
        variantSet.add(`${row.color?.name || "?"}/${sizeName}`);
        if (article.priceGranular) {
          const specific = row.prices?.[sizeName];
          const price = specific ? parseFloat(specific) || 0 : parseFloat(article.price) || 0;
          amount += price * qty;
        }
      }
    }
  } else {
    for (const row of article.rows) {
      for (const size of article.sizes) {
        const qty = parseInt(row.quantities[size.name] || "0", 10);
        if (qty > 0) {
          units += qty;
          variantSet.add(`${row.color?.name || "?"}/${size.name}`);
          if (article.priceGranular) {
            const specific = row.prices?.[size.name];
            const price = specific ? parseFloat(specific) || 0 : parseFloat(article.price) || 0;
            amount += price * qty;
          }
        }
      }
    }
  }

  const generalPrice = parseFloat(article.price) || 0;
  if (!article.priceGranular) {
    amount = units * generalPrice;
    const fmtG = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return { units, variants: variantSet.size, priceDisplay: `$${fmtG(generalPrice)}`, amount };
  }

  const allPrices: number[] = [];
  for (const row of article.rows) {
    for (const size of article.sizes) {
      const specific = row.prices?.[size.name];
      const p = specific ? parseFloat(specific) : generalPrice;
      if (p > 0) allPrices.push(p);
    }
  }
  const minP = allPrices.length ? Math.min(...allPrices) : 0;
  const maxP = allPrices.length ? Math.max(...allPrices) : 0;
  const fmt = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const priceDisplay = minP === maxP ? `$${fmt(minP)}` : `$${fmt(minP)} - $${fmt(maxP)}`;

  return { units, variants: variantSet.size, priceDisplay, amount };
}

export function ConfirmModal({ supplier, date, articles, selectedWarehouses, printColumns, printValues, onClose, onConfirmed, onValidationError }: Props) {
  const [step, setStep] = useState<"preview" | "submitting" | "done">("preview");
  const [result, setResult] = useState<OrderResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPdfInternal, setDownloadingPdfInternal] = useState(false);
  const [pdfComment, setPdfComment] = useState("");

  const mutation = useMutation({
    mutationFn: createOrder,
    onMutate: () => {
      setStep("submitting");
      setSubmitError(null);
    },
    onSuccess: (data) => {
      setResult(data);
      setStep("done");
      // Fire-and-forget image sync (best-effort, doesn't block UI)
      if (data.imageSyncData && data.imageSyncData.length > 0) {
        syncImagesAfterOrder(articles, data.imageSyncData).catch((err) =>
          console.error("Image sync failed:", err),
        );
      }
    },
    onError: (error: OrderError) => {
      if (error.validationErrors && error.validationErrors.length > 0) {
        onValidationError(error.validationErrors);
        onClose();
      } else {
        setSubmitError(error.error || "Error al crear la orden");
        setStep("preview");
      }
    },
  });

  function handleSubmit() {
    mutation.mutate({
      supplierId: supplier.id,
      date,
      articles,
      warehouseIds: selectedWarehouses.map((w) => w.id),
      printColumns,
      printValues,
      selectedWarehouses,
    });
  }

  async function downloadPdf(comment: string) {
    if (!result) return;
    setDownloadingPdf(true);
    const articlesForPdf = articles.map((a) => ({ ...a, colorImages: {} }));
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: result.purchaseOrderId,
          printColumns,
          printValues,
          articles: articlesForPdf,
          selectedWarehouses,
          comment,
          type: "supplier",
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.purchaseOrderName} - ${supplier.name} - ${date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function downloadPdfInternal() {
    if (!result) return;
    setDownloadingPdfInternal(true);
    const articlesForPdf = articles.map((a) => ({ ...a, colorImages: {} }));
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: result.purchaseOrderId,
          printColumns,
          printValues,
          articles: articlesForPdf,
          selectedWarehouses,
          type: "internal",
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.purchaseOrderName} - ${supplier.name} - ${date} - INT.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingPdfInternal(false);
    }
  }

  const warehouseMode = selectedWarehouses.length > 0;
  const summaries = articles.map((a) => ({ ...a, ...calcArticleSummary(a, warehouseMode) }));
  const grandTotal = summaries.reduce((s, a) => s + a.amount, 0);
  const grandUnits = summaries.reduce((s, a) => s + a.units, 0);

  const missingSizeAttribute = articles.some(
    (a) => !a.sizeAttributeId && a.sizes.length > 0,
  );

  return (
    <Modal
      opened
      onClose={step === "done" ? onConfirmed : onClose}
      title={
        <div>
          <Text fw={700} ff="var(--font-display)" size="lg">
            Confirmar orden de compra
          </Text>
          <Text size="sm" c="dimmed">
            {supplier.name} · {new Date(date).toLocaleDateString("es-AR")}
          </Text>
        </div>
      }
      size="lg"
      centered
      closeOnClickOutside={step !== "submitting"}
      withCloseButton={step !== "submitting"}
    >
      {step === "done" && result ? (
        <Stack align="center" py="lg" gap="md">
          <CheckCircle size={48} color="var(--green)" />
          <Text fw={600} size="lg">
            Orden creada: {result.purchaseOrderName}
          </Text>
          <Group>
            <Button color="amber" loading={downloadingPdf} onClick={() => downloadPdf(pdfComment)}>
              Descargar PDF Proveedor
            </Button>
            <Button variant="default" loading={downloadingPdfInternal} onClick={downloadPdfInternal}>
              Descargar PDF Interno
            </Button>
            <Button variant="default" onClick={onConfirmed}>
              Cerrar
            </Button>
          </Group>

        </Stack>
      ) : (
        <Stack gap="md">
          <Table striped highlightOnHover withTableBorder withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                {["Artículo", "Variantes", "Unidades", "Precio unit.", "Subtotal"].map((h) => (
                  <Table.Th key={h}>{h}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {summaries.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>{a.name}</Table.Td>
                  <Table.Td>{a.variants}</Table.Td>
                  <Table.Td>{a.units}</Table.Td>
                  <Table.Td>{a.priceDisplay}</Table.Td>
                  <Table.Td fw={600}>${a.amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td colSpan={2}>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Total</Text>
                </Table.Td>
                <Table.Td>
                  <Text c="amber" fw={700}>{grandUnits} u.</Text>
                </Table.Td>
                <Table.Td />
                <Table.Td>
                  <Text c="amber" fw={700}>${grandTotal.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                </Table.Td>
              </Table.Tr>
            </Table.Tfoot>
          </Table>

          {missingSizeAttribute && (
            <Text size="xs" c="orange">
              Advertencia: algunos artículos no tienen tipo de talle seleccionado. La confirmación puede fallar.
            </Text>
          )}

          {step === "submitting" && (
            <Group gap="xs" c="dimmed">
              <Loader size="xs" color="amber" />
              <Text size="sm">Creando productos → Variantes → Orden de compra...</Text>
            </Group>
          )}

          {submitError && (
            <Text c="red" size="sm">{submitError}</Text>
          )}

          <Textarea
            label="Comentario para PDF (opcional)"
            placeholder="Aparecerá en el PDF del proveedor"
            autosize
            minRows={2}
            maxRows={5}
            value={pdfComment}
            onChange={(e) => setPdfComment(e.currentTarget.value)}
            disabled={step === "submitting"}
          />

          <Group justify="flex-end" gap="sm">
            {step !== "submitting" && (
              <Button variant="default" onClick={onClose}>
                Cancelar
              </Button>
            )}
            <Button
              color="amber"
              onClick={handleSubmit}
              loading={step === "submitting"}
              disabled={step === "submitting"}
            >
              Enviar a Odoo →
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
