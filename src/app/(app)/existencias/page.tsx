"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ActionIcon,
  Tooltip,
  Text,
  Loader,
  Button,
  Drawer,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  History,
  AlertCircle,
  RefreshCw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  PanelLeftOpen,
} from "lucide-react";
import { ExistenciasSearchInput, type ExistenciasSearchInputHandle } from "@/components/existencias/ExistenciasSearchInput";
import { ArticleHeader } from "@/components/existencias/ArticleHeader";
import { ColorFilter } from "@/components/existencias/ColorFilter";
import { StockGrid } from "@/components/existencias/StockGrid";
import { SearchHistoryModal } from "@/components/existencias/SearchHistoryModal";
import { EmptyState } from "@/components/existencias/EmptyState";
import { FilterPanel } from "@/components/existencias/filters/FilterPanel";
import { ExistenciasResultCard, ExistenciasResultCardSkeleton } from "@/components/existencias/ExistenciasResultCard";
import { useProduct } from "@/hooks/useProduct";
import { useExistenciasStock } from "@/hooks/useExistenciasStock";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useFilterOptions } from "@/hooks/useFilterOptions";
import { useFilteredExistencias, FILTER_PAGE_LIMIT } from "@/hooks/useFilteredExistencias";
import { useFilterHistory, buildFilterLabel } from "@/hooks/useFilterHistory";
import type {
  ArticleSearchResult,
  SearchHistoryEntry,
  ExistenciasProduct,
  FilterState,
  FilterHistoryEntry,
} from "@/types";

const EMPTY_FILTERS: FilterState = {
  categoryIds: [],
  colorBases: [],
  equivalencias: [],
  brandValueIds: [],
  corteValueIds: [],
  materialValueIds: [],
};

function hasActiveFilters(f: FilterState): boolean {
  return (
    f.categoryIds.length > 0 ||
    f.colorBases.length > 0 ||
    f.equivalencias.length > 0 ||
    f.brandValueIds.length > 0 ||
    f.corteValueIds.length > 0 ||
    f.materialValueIds.length > 0
  );
}

export default function ExistenciasPage() {
  // ── Article detail state ────────────────────────────────────────────────────
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedColorValueId, setSelectedColorValueId] = useState<number | null>(null);
  const [highlightedVariantId, setHighlightedVariantId] = useState<number | null>(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [pendingFilters, setPendingFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchPage, setSearchPage] = useState(1);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(false);

  const isMobile = useMediaQuery("(max-width: 768px)");
  const searchRef = useRef<ExistenciasSearchInputHandle>(null);

  // ── Data hooks ──────────────────────────────────────────────────────────────
  const {
    data: product,
    isLoading: productLoading,
    error: productError,
    refetch: refetchProduct,
  } = useProduct(selectedTemplateId);

  const {
    data: stockData,
    isLoading: stockLoading,
    error: stockError,
    refetch: refetchStock,
  } = useExistenciasStock(selectedTemplateId);

  const { data: searchHistory = [], addEntry: addSearchHistory } = useSearchHistory();
  const filterOptions = useFilterOptions();
  const { history: filterHistory, addEntry: addFilterHistory, removeEntry: removeFilterHistory } = useFilterHistory();

  const {
    data: filterResults,
    isFetching: filterFetching,
  } = useFilteredExistencias(appliedFilters, searchPage, isSearchActive);

  // ── Auto-select first color on product load ─────────────────────────────────
  const [prevTemplateId, setPrevTemplateId] = useState<number | null>(null);
  if (product && product.templateId !== prevTemplateId) {
    setPrevTemplateId(product.templateId);
    const firstColor =
      product.variants.find((v) => v.colorAttributeValueId !== null)
        ?.colorAttributeValueId ?? null;
    setSelectedColorValueId(firstColor);
  }

  // ── Register search history when product loads ──────────────────────────────
  useEffect(() => {
    if (!product) return;
    const thumbVariant = product.variants[0];
    addSearchHistory({
      productTemplateId: product.templateId,
      productName: product.name,
      productRef: product.ref ?? undefined,
      thumbUrl: thumbVariant?.imageUrl ?? undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.templateId]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const selectTemplate = useCallback((templateId: number) => {
    setSelectedTemplateId(templateId);
    setHighlightedVariantId(null);
    setNotFoundBarcode(null);
    setErrorMsg(null);
    setFilterPanelCollapsed(true);
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
    [],
  );

  const handleArticleSelect = useCallback(
    (article: ArticleSearchResult) => selectTemplate(article.templateId),
    [selectTemplate],
  );

  const handleHistorySelect = useCallback(
    (entry: SearchHistoryEntry) => selectTemplate(entry.productTemplateId),
    [selectTemplate],
  );

  const handleSearch = useCallback(() => {
    if (!hasActiveFilters(pendingFilters)) return;
    setAppliedFilters(pendingFilters);
    setIsSearchActive(true);
    setSearchPage(1);
    setSelectedTemplateId(null);
    setFilterDrawerOpen(false);
    // Save to filter history
    const label = buildFilterLabel(pendingFilters, filterOptions);
    addFilterHistory(pendingFilters, label);
  }, [pendingFilters, filterOptions, addFilterHistory]);

  const handleClear = useCallback(() => {
    setPendingFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setIsSearchActive(false);
    setSearchPage(1);
    setFilterDrawerOpen(false);
  }, []);

  const handleApplyHistory = useCallback((entry: FilterHistoryEntry) => {
    setPendingFilters(entry.filters);
    setAppliedFilters(entry.filters);
    setIsSearchActive(true);
    setSearchPage(1);
    setSelectedTemplateId(null);
    setFilterDrawerOpen(false);
  }, []);

  const handleResultCardClick = useCallback((templateId: number) => {
    selectTemplate(templateId);
    setIsSearchActive(false);
  }, [selectTemplate]);

  // ── Pagination ───────────────────────────────────────────────────────────────
  const totalPages = filterResults
    ? Math.ceil(filterResults.total / FILTER_PAGE_LIMIT)
    : 0;

  // ── Layout helpers ───────────────────────────────────────────────────────────
  const hasError = productError || stockError;
  const showArticle = !!selectedTemplateId && !isSearchActive;
  const showResults = isSearchActive;
  const showEmpty = !showArticle && !showResults;

  const filterPanelContent = (
    <FilterPanel
      filters={pendingFilters}
      onChange={setPendingFilters}
      onSearch={handleSearch}
      onClear={handleClear}
      onCollapse={isMobile ? undefined : () => setFilterPanelCollapsed(true)}
      options={filterOptions}
      history={filterHistory}
      onApplyHistory={handleApplyHistory}
      onRemoveHistory={removeFilterHistory}
      isSearching={filterFetching}
    />
  );

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
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
          flexShrink: 0,
        }}
      >
        <Text
          fw={700}
          size="lg"
          style={{ fontFamily: "var(--font-display)", marginRight: 4, flexShrink: 0 }}
        >
          Existencias
        </Text>

        <div style={{ flex: "1 1 0", maxWidth: 480 }}>
          <ExistenciasSearchInput
            ref={searchRef}
            onBarcodeResult={handleBarcodeResult}
            onNotFound={(code) => setNotFoundBarcode(code)}
            onError={(msg) => setErrorMsg(msg)}
            onSelect={handleArticleSelect}
          />
        </div>

        {/* Mobile: open filter drawer */}
        {isMobile && (
          <Tooltip label="Filtros">
            <ActionIcon
              variant={isSearchActive ? "filled" : "subtle"}
              color={isSearchActive ? "amber" : undefined}
              size="lg"
              onClick={() => setFilterDrawerOpen(true)}
            >
              <SlidersHorizontal size={18} />
            </ActionIcon>
          </Tooltip>
        )}

        <Tooltip label="Historial de consultas">
          <ActionIcon variant="subtle" size="lg" onClick={() => setHistoryModalOpen(true)}>
            <History size={18} />
          </ActionIcon>
        </Tooltip>
      </div>

      {/* Banners */}
      {notFoundBarcode && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 24px",
            background: "color-mix(in srgb, var(--mantine-color-orange-9) 20%, transparent)",
            borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-orange-6) 30%, transparent)",
            flexShrink: 0,
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
            borderBottom: "1px solid color-mix(in srgb, var(--mantine-color-red-6) 30%, transparent)",
            flexShrink: 0,
          }}
        >
          <AlertCircle size={14} color="var(--mantine-color-red-4)" />
          <Text size="sm" c="var(--mantine-color-red-4)">{errorMsg}</Text>
        </div>
      )}

      {/* Body: filter column + content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left filter column — desktop only */}
        {!isMobile && (
          <div
            style={{
              width: filterPanelCollapsed ? 40 : 280,
              flexShrink: 0,
              borderRight: "1px solid var(--border)",
              background: "var(--surface)",
              display: "flex",
              flexDirection: "column",
              transition: "width 200ms ease",
              overflow: "hidden",
            }}
          >
            {filterPanelCollapsed ? (
              <button
                onClick={() => setFilterPanelCollapsed(false)}
                title="Mostrar filtros"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingTop: 14,
                  width: "100%",
                  height: "100%",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text3)",
                  gap: 6,
                }}
              >
                <PanelLeftOpen size={16} />
                {isSearchActive && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--mantine-color-amber-5)",
                      flexShrink: 0,
                    }}
                  />
                )}
              </button>
            ) : (
              filterPanelContent
            )}
          </div>
        )}

        {/* Right content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Article detail */}
          {showArticle && (
            <>
              {hasError ? (
                <div style={{ padding: 48, textAlign: "center" }}>
                  <AlertCircle size={32} color="var(--mantine-color-red-5)" style={{ marginBottom: 12 }} />
                  <Text c="dimmed" mb={16}>Error al cargar datos de Odoo</Text>
                  <Button
                    leftSection={<RefreshCw size={14} />}
                    variant="subtle"
                    onClick={() => { refetchProduct(); refetchStock(); }}
                  >
                    Reintentar
                  </Button>
                </div>
              ) : (
                <>
                  {(productLoading || product) && (
                    <ArticleHeader
                      product={
                        product ?? ({
                          templateId: 0,
                          name: "",
                          ref: null,
                          listPrice: null,
                          categoryId: null,
                          variants: [],
                          attributes: [],
                        } as ExistenciasProduct)
                      }
                      selectedColorValueId={selectedColorValueId}
                      loading={productLoading}
                    />
                  )}
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
                  {stockLoading ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 32, justifyContent: "center", color: "var(--text2)" }}>
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
                </>
              )}
            </>
          )}

          {/* Filter results */}
          {showResults && (
            <div style={{ padding: 20 }}>
              {/* Results count */}
              {filterResults && !filterFetching && (
                <Text size="sm" c="dimmed" mb={16} style={{ fontFamily: "var(--font-sans)" }}>
                  {filterResults.total === 0
                    ? "No hay artículos que coincidan con los filtros seleccionados."
                    : `${filterResults.total} artículo${filterResults.total !== 1 ? "s" : ""} encontrado${filterResults.total !== 1 ? "s" : ""}`}
                </Text>
              )}

              {/* No filters message */}
              {!hasActiveFilters(appliedFilters) && (
                <Text size="sm" c="dimmed" style={{ fontFamily: "var(--font-sans)" }}>
                  Seleccioná al menos un filtro para buscar.
                </Text>
              )}

              {/* Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                {filterFetching
                  ? Array.from({ length: 12 }).map((_, i) => (
                      <ExistenciasResultCardSkeleton key={i} />
                    ))
                  : filterResults?.items.map((item) => (
                      <ExistenciasResultCard
                        key={item.id}
                        item={item}
                        onClick={handleResultCardClick}
                      />
                    ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    justifyContent: "center",
                    paddingBottom: 24,
                  }}
                >
                  <ActionIcon
                    variant="subtle"
                    disabled={searchPage <= 1 || filterFetching}
                    onClick={() => setSearchPage((p) => p - 1)}
                  >
                    <ChevronLeft size={16} />
                  </ActionIcon>
                  <Text size="sm" c="dimmed" style={{ fontFamily: "var(--font-sans)" }}>
                    Página {searchPage} de {totalPages}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    disabled={searchPage >= totalPages || filterFetching}
                    onClick={() => setSearchPage((p) => p + 1)}
                  >
                    <ChevronRight size={16} />
                  </ActionIcon>
                </div>
              )}
            </div>
          )}

          {/* Default: last scanned */}
          {showEmpty && (
            <EmptyState
              recentEntries={searchHistory.slice(0, 5)}
              onSelect={handleHistorySelect}
            />
          )}
        </div>
      </div>

      {/* Mobile: filter drawer */}
      <Drawer
        opened={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        position="left"
        size={300}
        title={null}
        padding={0}
        withCloseButton={false}
      >
        {filterPanelContent}
      </Drawer>

      {/* History modal */}
      <SearchHistoryModal
        opened={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        entries={searchHistory}
        onSelect={(entry) => {
          setHistoryModalOpen(false);
          handleHistorySelect(entry);
        }}
      />
    </div>
  );
}
