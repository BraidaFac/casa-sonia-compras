"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, CheckCircle, Loader } from "lucide-react";
import type { Article, Supplier } from "@/types";

interface Props {
  supplier: Supplier;
  date: string;
  articles: Article[];
  onClose: () => void;
  onConfirmed: () => void;
}

interface OrderResult {
  purchaseOrderId: number;
  purchaseOrderName: string;
}

interface OrderError {
  error: string;
  createdProductIds?: number[];
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
    return { units, variants: variantSet.size, priceDisplay: `$${generalPrice.toFixed(2)}`, amount };
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
  const priceDisplay = minP === maxP ? `$${minP.toFixed(2)}` : `$${minP.toFixed(2)} - $${maxP.toFixed(2)}`;

  return { units, variants: variantSet.size, priceDisplay, amount };
}

export function ConfirmModal({ supplier, date, articles, onClose, onConfirmed }: Props) {
  const [step, setStep] = useState<"preview" | "submitting" | "done">("preview");
  const [result, setResult] = useState<OrderResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
      setSubmitError(error.error || "Error al crear la orden");
      setStep("preview");
    },
  });

  function handleSubmit() {
    mutation.mutate({ supplierId: supplier.id, date, articles });
  }

  const summaries = articles.map((a) => ({ ...a, ...calcArticleSummary(a) }));
  const grandTotal = summaries.reduce((s, a) => s + a.amount, 0);
  const grandUnits = summaries.reduce((s, a) => s + a.units, 0);

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const modalStyle: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    width: "100%",
    maxWidth: 720,
    maxHeight: "90vh",
    overflowY: "auto",
    padding: 32,
  };

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) { step === "done" ? onConfirmed() : onClose(); } }}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 20, color: "var(--text)" }}>
              Confirmar orden de compra
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text2)" }}>
              {supplier.name} · {new Date(date).toLocaleDateString("es-AR")}
            </p>
          </div>
          {step !== "submitting" && (
            <button
              type="button"
              onClick={onClose}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                color: "var(--text3)",
                cursor: "pointer",
              }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {step === "done" && result ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <CheckCircle size={48} color="var(--green)" style={{ margin: "0 auto 16px" }} />
            <h3 style={{ color: "var(--text)", marginBottom: 8 }}>
              Orden creada: {result.purchaseOrderName}
            </h3>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
              <a
                href={`/api/pdf?orderId=${result.purchaseOrderId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                Descargar PDF
              </a>
              <button
                type="button"
                onClick={onConfirmed}
                style={{
                  background: "var(--surface2)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "10px 20px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Articles table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 16 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border2)" }}>
                  {["Artículo", "Variantes", "Unidades", "Precio unit.", "Subtotal"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "6px 8px",
                        color: "var(--text2)",
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaries.map((a) => (
                  <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 8px", color: "var(--text)" }}>{a.name}</td>
                    <td style={{ padding: "8px 8px", color: "var(--text2)" }}>{a.variants}</td>
                    <td style={{ padding: "8px 8px", color: "var(--text)" }}>{a.units}</td>
                    <td style={{ padding: "8px 8px", color: "var(--text2)" }}>
                      {a.priceDisplay}
                    </td>
                    <td style={{ padding: "8px 8px", color: "var(--text)", fontWeight: 600 }}>
                      ${a.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ padding: "10px 8px", color: "var(--text2)", fontSize: 12 }}>
                    TOTAL
                  </td>
                  <td style={{ padding: "10px 8px", color: "var(--accent)", fontWeight: 700 }}>
                    {grandUnits} u.
                  </td>
                  <td />
                  <td style={{ padding: "10px 8px", color: "var(--accent)", fontWeight: 700 }}>
                    ${grandTotal.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Step indicator */}
            {step === "submitting" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                  color: "var(--text2)",
                  fontSize: 13,
                }}
              >
                <Loader size={14} style={{ animation: "spin 1s linear infinite" }} />
                Creando productos → Variantes → Orden de compra...
              </div>
            )}

            {submitError && (
              <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>
                {submitError}
              </p>
            )}

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              {step !== "submitting" && (
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: "var(--surface2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "10px 20px",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={step === "submitting"}
                style={{
                  background: step === "submitting" ? "var(--surface3)" : "var(--accent)",
                  color: step === "submitting" ? "var(--text3)" : "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: step === "submitting" ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {step === "submitting" ? (
                  <>
                    <Loader size={14} />
                    Enviando...
                  </>
                ) : (
                  "Enviar a Odoo →"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
