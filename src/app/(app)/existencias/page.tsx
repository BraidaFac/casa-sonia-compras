"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { ActionIcon, Tooltip, Text, Loader, Button } from "@mantine/core";
import { History, AlertCircle, RefreshCw } from "lucide-react";
import { ExistenciasSearchInput, type ExistenciasSearchInputHandle } from "@/components/existencias/ExistenciasSearchInput";
import { ArticleHeader } from "@/components/existencias/ArticleHeader";
import { ColorFilter } from "@/components/existencias/ColorFilter";
import { StockGrid } from "@/components/existencias/StockGrid";
import { SearchHistoryModal } from "@/components/existencias/SearchHistoryModal";
import { EmptyState } from "@/components/existencias/EmptyState";
import { useExistenciasProduct } from "@/hooks/useExistenciasProduct";
import { useExistenciasStock } from "@/hooks/useExistenciasStock";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import type { ArticleSearchResult, SearchHistoryEntry, ExistenciasProduct } from "@/types";

export default function ExistenciasPage() {
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedColorValueId, setSelectedColorValueId] = useState<number | null>(null);
  const [highlightedVariantId, setHighlightedVariantId] = useState<number | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const searchRef = useRef<ExistenciasSearchInputHandle>(null);

  const {
    data: product,
    isLoading: productLoading,
    error: productError,
    refetch: refetchProduct,
  } = useExistenciasProduct(selectedTemplateId);

  const {
    data: stockData,
    isLoading: stockLoading,
    error: stockError,
    refetch: refetchStock,
  } = useExistenciasStock(selectedTemplateId);

  const { data: history = [], addEntry } = useSearchHistory();

  // When product loads, auto-select first color (using state to track previous value)
  const [prevTemplateId, setPrevTemplateId] = useState<number | null>(null);
  if (product && product.templateId !== prevTemplateId) {
    setPrevTemplateId(product.templateId);
    const firstColor =
      product.variants.find((v) => v.colorAttributeValueId !== null)
        ?.colorAttributeValueId ?? null;
    setSelectedColorValueId(firstColor);
  }

  const selectTemplate = useCallback((templateId: number) => {
    setSelectedTemplateId(templateId);
    setHighlightedVariantId(null);
    setNotFoundBarcode(null);
    setErrorMsg(null);
    setTimeout(() => searchRef.current?.focus(), 100);
  }, []);

  const handleBarcodeResult = useCallback(
    (result: {
      variantId: number;
      templateId: number;
      colorAttributeValueId: number | null;
      sizeAttributeValueId: number | null;
    }) => {
      setSelectedTemplateId(result.templateId);
      setSelectedColorValueId(result.colorAttributeValueId);
      setHighlightedVariantId(result.variantId);
      setNotFoundBarcode(null);
      setErrorMsg(null);
    },
    []
  );

  const handleArticleSelect = useCallback(
    (article: ArticleSearchResult) => {
      selectTemplate(article.templateId);
    },
    [selectTemplate]
  );

  const handleHistorySelect = useCallback(
    (entry: SearchHistoryEntry) => {
      selectTemplate(entry.productTemplateId);
    },
    [selectTemplate]
  );

  // Register history when product loads (side effect — must be in useEffect)
  useEffect(() => {
    if (!product) return;
    const thumbVariant = product.variants[0];
    addEntry({
      productTemplateId: product.templateId,
      productName: product.name,
      productRef: product.ref ?? undefined,
      thumbUrl: thumbVariant?.imageUrl ?? undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.templateId]);

  const isLoading = productLoading || stockLoading;
  const hasError = productError || stockError;

  // Suppress unused variable warning — isLoading used implicitly via productLoading/stockLoading
  void isLoading;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      {/* Header bar */}
      <div
        style={{
          padding: "12px 24px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <Text
          fw={700}
          size="lg"
          style={{ fontFamily: "var(--font-display)", marginRight: 4, flexShrink: 0 }}
        >
          Existencias
        </Text>

        {/* Unified scan + search input */}
        <div style={{ flex: "1 1 0", maxWidth: 480 }}>
          <ExistenciasSearchInput
            ref={searchRef}
            onBarcodeResult={handleBarcodeResult}
            onNotFound={(code) => setNotFoundBarcode(code)}
            onError={(msg) => setErrorMsg(msg)}
            onSelect={handleArticleSelect}
          />
        </div>

        {/* History button */}
        <Tooltip label="Historial de consultas">
          <ActionIcon variant="subtle" size="lg" onClick={() => setHistoryModalOpen(true)}>
            <History size={18} />
          </ActionIcon>
        </Tooltip>
      </div>

      {/* Not found / error banners */}
      {notFoundBarcode && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 24px",
            background:
              "color-mix(in srgb, var(--mantine-color-orange-9) 20%, transparent)",
            borderBottom:
              "1px solid color-mix(in srgb, var(--mantine-color-orange-6) 30%, transparent)",
          }}
        >
          <AlertCircle size={14} color="var(--mantine-color-orange-4)" />
          <Text size="sm" c="var(--mantine-color-orange-4)">
            Código no encontrado: <strong>{notFoundBarcode}</strong>
          </Text>
        </div>
      )}
      {errorMsg && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 24px",
            background: "color-mix(in srgb, var(--mantine-color-red-9) 20%, transparent)",
            borderBottom:
              "1px solid color-mix(in srgb, var(--mantine-color-red-6) 30%, transparent)",
          }}
        >
          <AlertCircle size={14} color="var(--mantine-color-red-4)" />
          <Text size="sm" c="var(--mantine-color-red-4)">
            {errorMsg}
          </Text>
        </div>
      )}

      {/* Content */}
      {!selectedTemplateId ? (
        <EmptyState
          recentEntries={history.slice(0, 5)}
          onSelect={handleHistorySelect}
        />
      ) : hasError ? (
        <div style={{ padding: 48, textAlign: "center" }}>
          <AlertCircle
            size={32}
            color="var(--mantine-color-red-5)"
            style={{ marginBottom: 12 }}
          />
          <Text c="dimmed" mb={16}>
            Error al cargar datos de Odoo
          </Text>
          <Button
            leftSection={<RefreshCw size={14} />}
            variant="subtle"
            onClick={() => {
              refetchProduct();
              refetchStock();
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : (
        <div>
          {/* Article header */}
          {(productLoading || product) && (
            <ArticleHeader
              product={
                product ?? ({
                  templateId: 0,
                  name: "",
                  ref: null,
                  listPrice: null,
                  variants: [],
                  attributes: [],
                } as ExistenciasProduct)
              }
              selectedColorValueId={selectedColorValueId}
              loading={productLoading}
            />
          )}

          {/* Color filter */}
          {product && (
            <ColorFilter
              variants={product.variants}
              selectedColorValueId={selectedColorValueId}
              onChange={(id) => {
                setSelectedColorValueId(id);
                setHighlightedVariantId(null);
              }}
            />
          )}

          {/* Stock grid */}
          {stockLoading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 32,
                justifyContent: "center",
                color: "var(--text2)",
              }}
            >
              <Loader size={18} /> Cargando stock...
            </div>
          ) : stockData && product ? (
            <StockGrid
              variants={product.variants}
              locations={stockData.locations}
              stock={stockData.stock}
              selectedColorValueId={selectedColorValueId}
              highlightedVariantId={highlightedVariantId}
            />
          ) : null}
        </div>
      )}

      {/* History modal */}
      <SearchHistoryModal
        opened={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        entries={history}
        onSelect={(entry) => {
          setHistoryModalOpen(false);
          handleHistorySelect(entry);
        }}
      />
    </div>
  );
}
