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
import type { Article, Supplier, PrintColumn, PrintValues } from "@/types";

interface Props {
  supplier: Supplier;
  date: string;
  articles: Article[];
  printColumns: PrintColumn[];
  printValues: PrintValues;
  onClose: () => void;
  onConfirmed: () => void;
  onValidationError: (errors: { articleName: string; type: "color" | "size"; value: string }[]) => void;
}

interface OrderResult {
  purchaseOrderId: number;
  purchaseOrderName: string;
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
}): Promise<OrderResult> {
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err: OrderError = await res.json();
    throw err;
  }

  return res.json();
}

function calcArticleSummary(article: Article) {
  let units = 0;
  let amount = 0;
  const variantSet = new Set<string>();

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

export function ConfirmModal({ supplier, date, articles, printColumns, printValues, onClose, onConfirmed, onValidationError }: Props) {
  const [step, setStep] = useState<"preview" | "submitting" | "done">("preview");
  const [result, setResult] = useState<OrderResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
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
    mutation.mutate({ supplierId: supplier.id, date, articles });
  }

  async function downloadPdf(comment: string) {
    if (!result) return;
    setShowCommentModal(false);
    setDownloadingPdf(true);
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: result.purchaseOrderId,
          printColumns,
          printValues,
          articles,
          comment,
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${supplier.name}-${date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingPdf(false);
    }
  }

  const summaries = articles.map((a) => ({ ...a, ...calcArticleSummary(a) }));
  const grandTotal = summaries.reduce((s, a) => s + a.amount, 0);
  const grandUnits = summaries.reduce((s, a) => s + a.units, 0);

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
            <Button color="amber" loading={downloadingPdf} onClick={() => { setPdfComment(""); setShowCommentModal(true); }}>
              Descargar PDF
            </Button>
            <Button variant="default" onClick={onConfirmed}>
              Cerrar
            </Button>
          </Group>

          <Modal
            opened={showCommentModal}
            onClose={() => setShowCommentModal(false)}
            title="Comentario para el proveedor"
            size="sm"
            centered
          >
            <Stack gap="md">
              <Textarea
                placeholder="Opcional — aparecerá en el PDF"
                autosize
                minRows={3}
                maxRows={6}
                value={pdfComment}
                onChange={(e) => setPdfComment(e.currentTarget.value)}
              />
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setShowCommentModal(false)}>Cancelar</Button>
                <Button color="amber" onClick={() => downloadPdf(pdfComment)}>Descargar PDF</Button>
              </Group>
            </Stack>
          </Modal>
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

          {step === "submitting" && (
            <Group gap="xs" c="dimmed">
              <Loader size="xs" color="amber" />
              <Text size="sm">Creando productos → Variantes → Orden de compra...</Text>
            </Group>
          )}

          {submitError && (
            <Text c="red" size="sm">{submitError}</Text>
          )}

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
