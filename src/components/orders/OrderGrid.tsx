"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { ArticleRow } from "./ArticleRow";
import { ConfirmModal } from "./ConfirmModal";
import { useAttributes } from "@/hooks/useAttributes";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Article, Supplier } from "@/types";

interface Props {
  supplier: Supplier | null;
  date: string;
}

function createEmptyArticle(): Article {
  return {
    id: crypto.randomUUID(),
    name: "",
    existingProductId: null,
    price: "",
    priceGranular: false,
    rows: [
      {
        id: crypto.randomUUID(),
        color: null,
        quantities: {},
      },
    ],
    sizes: [],
  };
}

export function OrderGrid({ supplier, date }: Props) {
  const [articles, setArticles] = useState<Article[]>([createEmptyArticle()]);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: attrData, isLoading: attrLoading, error: attrError } = useAttributes();

  const allColors = attrData?.colors || [];
  const allSizes = attrData?.sizes || [];

  function updateArticle(id: string, updated: Article) {
    setArticles((prev) => prev.map((a) => (a.id === id ? updated : a)));
  }

  function removeArticle(id: string) {
    setArticles((prev) => prev.filter((a) => a.id !== id));
  }

  function addArticle() {
    setArticles((prev) => [...prev, createEmptyArticle()]);
  }

  const totalUnits = articles.reduce((sum, article) => {
    return (
      sum +
      article.rows.reduce((s2, row) => {
        return (
          s2 +
          article.sizes.reduce((s3, size) => {
            const qty = parseInt(row.quantities[size.name] || "0", 10);
            return s3 + (isNaN(qty) ? 0 : qty);
          }, 0)
        );
      }, 0)
    );
  }, 0);

  const totalAmount = articles.reduce((sum, article) => {
    return sum + article.rows.reduce((s2, row) => {
      return s2 + article.sizes.reduce((s3, size) => {
        const qty = parseInt(row.quantities[size.name] || "0", 10);
        if (isNaN(qty) || qty <= 0) return s3;
        let price: number;
        if (article.priceGranular) {
          const specific = row.prices?.[size.name];
          price = specific ? parseFloat(specific) || 0 : parseFloat(article.price) || 0;
        } else {
          price = parseFloat(article.price) || 0;
        }
        return s3 + price * qty;
      }, 0);
    }, 0);
  }, 0);

  const hasValidationErrors = articles.some((a) => {
    const hasQty = a.rows.some((r) =>
      a.sizes.some((s) => parseInt(r.quantities[s.name] || "0", 10) > 0),
    );
    const missingPrice = !a.priceGranular && !a.price && hasQty;
    const missingColor = a.rows.some((r) =>
      a.sizes.some((s) => parseInt(r.quantities[s.name] || "0", 10) > 0 && !r.color),
    );
    return missingPrice || missingColor;
  });

  const canSubmit =
    supplier &&
    date &&
    !hasValidationErrors &&
    articles.some((a) =>
      a.rows.some((r) =>
        a.sizes.some((s) => {
          const qty = parseInt(r.quantities[s.name] || "0", 10);
          return qty > 0;
        }),
      ),
    );

  if (attrLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 48, color: "var(--text2)" }}>
        <LoadingSpinner size={20} />
        Cargando atributos de Odoo...
      </div>
    );
  }

  if (attrError) {
    return (
      <div style={{ padding: 24, color: "var(--red)", fontSize: 14 }}>
        Error al cargar atributos de Odoo. Verificar conexión.
      </div>
    );
  }

  return (
    <div>
      {/* Sticky totals bar */}
      {(totalUnits > 0 || totalAmount > 0) && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "8px 16px",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--text2)" }}>Total:</span>
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>
            {totalUnits} unidades
          </span>
          <span style={{ color: "var(--text2)" }}>·</span>
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>
            ${totalAmount.toFixed(2)}
          </span>
        </div>
      )}

      {/* Articles */}
      {articles.map((article) => (
        <ArticleRow
          key={article.id}
          article={article}
          allColors={allColors}
          allSizes={allSizes}
          onChange={(updated) => updateArticle(article.id, updated)}
          onRemove={() => removeArticle(article.id)}
        />
      ))}

      {/* Add article */}
      <button
        type="button"
        onClick={addArticle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "1px dashed var(--border2)",
          color: "var(--text3)",
          cursor: "pointer",
          padding: "8px 16px",
          borderRadius: 6,
          fontSize: 13,
          width: "100%",
          justifyContent: "center",
          marginBottom: 24,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border2)")}
      >
        <Plus size={14} /> Agregar artículo
      </button>

      {/* Submit */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={!canSubmit}
          style={{
            background: canSubmit ? "var(--accent)" : "var(--surface3)",
            color: canSubmit ? "#fff" : "var(--text3)",
            border: "none",
            borderRadius: 6,
            padding: "11px 28px",
            fontSize: 15,
            fontWeight: 600,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          Revisar orden →
        </button>
      </div>

      {showConfirm && supplier && (
        <ConfirmModal
          supplier={supplier}
          date={date}
          articles={articles}
          onClose={() => setShowConfirm(false)}
          onConfirmed={() => {
            setArticles([createEmptyArticle()]);
            setShowConfirm(false);
          }}
        />
      )}
    </div>
  );
}
