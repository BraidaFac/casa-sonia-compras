"use client";
import { useRef, useState, useEffect } from "react";
import { ComboBox } from "@/components/ui/ComboBox";
import { useProducts } from "@/hooks/useProducts";
import type { Article, ArticleRow as ArticleRowType, AttributeValue } from "@/types";
import { X, Plus, ToggleLeft, ToggleRight, EyeOff, Eye } from "lucide-react";

interface Props {
  article: Article;
  allColors: AttributeValue[];
  allSizes: AttributeValue[];
  onChange: (article: Article) => void;
  onRemove: () => void;
}

const COLOR_COL = "__color__";
const DEFAULT_COLOR_W = 140;
const DEFAULT_SIZE_W = 80;

export function ArticleRow({ article, allColors, allSizes, onChange, onRemove }: Props) {
  const [nameQuery, setNameQuery] = useState(article.name);
  const [debouncedNameQuery, setDebouncedNameQuery] = useState("");
  const [showProductList, setShowProductList] = useState(false);
  const nameTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const nameRef = useRef<HTMLDivElement>(null);

  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [hiddenSizes, setHiddenSizes] = useState<Set<string>>(new Set());
  const resizingRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

  const { data: products } = useProducts(debouncedNameQuery);

  useEffect(() => {
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    nameTimerRef.current = setTimeout(() => setDebouncedNameQuery(nameQuery), 300);
    return () => {
      if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    };
  }, [nameQuery]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (nameRef.current && !nameRef.current.contains(e.target as Node)) {
        setShowProductList(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function getColWidth(key: string, def: number) {
    return colWidths[key] ?? def;
  }

  function startResize(e: React.MouseEvent, key: string, def: number) {
    e.preventDefault();
    resizingRef.current = { col: key, startX: e.clientX, startWidth: colWidths[key] ?? def };

    function onMove(ev: MouseEvent) {
      const resizing = resizingRef.current;
      if (!resizing) return;
      const delta = ev.clientX - resizing.startX;
      const newW = Math.max(40, resizing.startWidth + delta);
      setColWidths((prev) => ({ ...prev, [resizing.col]: newW }));
    }
    function onUp() {
      resizingRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function toggleHideSize(name: string) {
    setHiddenSizes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleSelectProduct(p: { id: number; name: string; colors: AttributeValue[]; sizes: AttributeValue[] }) {
    const newRows: ArticleRowType[] = p.colors.length > 0
      ? p.colors.map((color) => ({
          id: crypto.randomUUID(),
          color,
          quantities: Object.fromEntries(p.sizes.map((s) => [s.name, ""])),
        }))
      : [{ id: crypto.randomUUID(), color: null, quantities: Object.fromEntries(p.sizes.map((s) => [s.name, ""])) }];

    onChange({
      ...article,
      name: p.name,
      existingProductId: p.id,
      sizes: p.sizes,
      rows: newRows,
    });
    setNameQuery(p.name);
    setShowProductList(false);
  }

  function updateRow(rowId: string, updates: Partial<ArticleRowType>) {
    onChange({
      ...article,
      rows: article.rows.map((r) => (r.id === rowId ? { ...r, ...updates } : r)),
    });
  }

  function addRow() {
    onChange({
      ...article,
      rows: [
        ...article.rows,
        {
          id: crypto.randomUUID(),
          color: null,
          quantities: Object.fromEntries(article.sizes.map((s) => [s.name, ""])),
        },
      ],
    });
  }

  function removeRow(rowId: string) {
    onChange({ ...article, rows: article.rows.filter((r) => r.id !== rowId) });
  }

  function addSize() {
    const newSize: AttributeValue = { id: Date.now(), name: "", isNew: true };
    const updatedRows = article.rows.map((r) => ({
      ...r,
      quantities: { ...r.quantities, "": "" },
    }));
    onChange({ ...article, sizes: [...article.sizes, newSize], rows: updatedRows });
  }

  function updateSizeName(idx: number, newName: string) {
    const oldName = article.sizes[idx].name;
    const newSizes = article.sizes.map((s, i) => (i === idx ? { ...s, name: newName } : s));
    const newRows = article.rows.map((r) => {
      const qty = r.quantities[oldName] ?? "";
      const newQtys = { ...r.quantities };
      delete newQtys[oldName];
      newQtys[newName] = qty;
      return { ...r, quantities: newQtys };
    });
    onChange({ ...article, sizes: newSizes, rows: newRows });
  }

  function removeSize(idx: number) {
    const sizeName = article.sizes[idx].name;
    const newSizes = article.sizes.filter((_, i) => i !== idx);
    const newRows = article.rows.map((r) => {
      const newQtys = { ...r.quantities };
      delete newQtys[sizeName];
      return { ...r, quantities: newQtys };
    });
    onChange({ ...article, sizes: newSizes, rows: newRows });
  }

  function updateQty(rowId: string, sizeName: string, val: string) {
    const row = article.rows.find((r) => r.id === rowId);
    if (!row) return;
    updateRow(rowId, { quantities: { ...row.quantities, [sizeName]: val } });
  }

  const articleHasQty = article.rows.some((r) =>
    article.sizes.some((s) => parseInt(r.quantities[s.name] || "0", 10) > 0),
  );
  const missingGeneralPrice = !article.priceGranular && !article.price && articleHasQty;

  const allSizesHaveSpecificPrice =
    article.priceGranular &&
    article.sizes.length > 0 &&
    article.rows.every((row) =>
      article.sizes.every((size) => !!row.prices?.[size.name]),
    );

  useEffect(() => {
    if (allSizesHaveSpecificPrice && article.price) {
      onChange({ ...article, price: "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSizesHaveSpecificPrice]);

  const totalUnits = article.rows.reduce((sum, row) => {
    return (
      sum +
      article.sizes.reduce((s2, size) => {
        const qty = parseInt(row.quantities[size.name] || "0", 10);
        return s2 + (isNaN(qty) ? 0 : qty);
      }, 0)
    );
  }, 0);

  const cellStyle: React.CSSProperties = {
    border: "1px solid var(--border)",
    padding: "4px",
    background: "var(--surface)",
    textAlign: "center",
  };

  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    background: "var(--surface3)",
    color: "var(--text2)",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 8px",
    position: "relative",
    userSelect: "none",
    overflow: "hidden",
  };

  const resizeHandle: React.CSSProperties = {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 5,
    cursor: "col-resize",
    zIndex: 1,
  };

  const visibleSizes = article.sizes.filter((s) => !hiddenSizes.has(s.name));
  const hiddenSizesList = article.sizes.filter((s) => hiddenSizes.has(s.name));

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
      }}
    >
      {/* Article header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        {/* Product name autocomplete */}
        <div ref={nameRef} style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <input
            type="text"
            value={nameQuery}
            placeholder="Nombre del artículo..."
            onChange={(e) => {
              setNameQuery(e.target.value);
              onChange({ ...article, name: e.target.value, existingProductId: null });
              setShowProductList(true);
            }}
            onFocus={() => setShowProductList(true)}
            style={{
              width: "100%",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 14,
              fontWeight: 600,
              outline: "none",
            }}
          />
          {showProductList && products && products.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                zIndex: 50,
                background: "var(--surface2)",
                border: "1px solid var(--border2)",
                borderRadius: 6,
                maxHeight: 200,
                overflowY: "auto",
                marginTop: 4,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={() => handleSelectProduct(p)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "7px 12px",
                    background: "none",
                    border: "none",
                    color: "var(--text)",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface3)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  {p.name}
                  {(p.colors.length > 0 || p.sizes.length > 0) && (
                    <span style={{ color: "var(--text3)", fontSize: 11, marginLeft: 6 }}>
                      {p.colors.length} colores · {p.sizes.length} talles
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Price */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: allSizesHaveSpecificPrice ? "var(--text3)" : "var(--text2)", fontSize: 13 }}>
          Precio $
          <input
            type="number"
            min={0}
            value={article.price}
            disabled={allSizesHaveSpecificPrice}
            onChange={(e) => onChange({ ...article, price: e.target.value })}
            title={allSizesHaveSpecificPrice ? "Todas las columnas tienen precio específico" : undefined}
            style={{
              width: 100,
              background: allSizesHaveSpecificPrice ? "var(--surface3)" : missingGeneralPrice ? "rgba(239,68,68,0.1)" : "var(--surface2)",
              border: `1px solid ${missingGeneralPrice ? "var(--red)" : "var(--border)"}`,
              color: allSizesHaveSpecificPrice ? "var(--text3)" : "var(--text)",
              borderRadius: 6,
              padding: "5px 8px",
              fontSize: 14,
              outline: "none",
              cursor: allSizesHaveSpecificPrice ? "not-allowed" : "auto",
            }}
          />
        </label>

        {/* Granular toggle */}
        <button
          type="button"
          onClick={() => onChange({ ...article, priceGranular: !article.priceGranular })}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "none",
            border: "none",
            color: article.priceGranular ? "var(--accent)" : "var(--text3)",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {article.priceGranular ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          Granular
        </button>

        {/* Total badge */}
        {totalUnits > 0 && (
          <span
            style={{
              background: "var(--accent-bg)",
              color: "var(--accent)",
              border: "1px solid var(--accent)",
              borderRadius: 20,
              padding: "2px 10px",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {totalUnits} u.
          </span>
        )}

        {/* Remove article */}
        <button
          type="button"
          onClick={onRemove}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            color: "var(--text3)",
            cursor: "pointer",
            padding: 4,
          }}
          title="Eliminar artículo"
        >
          <X size={16} />
        </button>
      </div>

      {/* Hidden sizes chips */}
      {hiddenSizesList.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text3)", alignSelf: "center" }}>Ocultos:</span>
          {hiddenSizesList.map((size) => (
            <button
              key={size.id}
              type="button"
              onClick={() => toggleHideSize(size.name)}
              title="Mostrar talle"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                color: "var(--text3)",
                borderRadius: 4,
                padding: "2px 7px",
                fontSize: 11,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <Eye size={10} />
              {size.name}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed", fontSize: 13 }}>
          <colgroup>
            <col style={{ width: getColWidth(COLOR_COL, DEFAULT_COLOR_W) }} />
            {visibleSizes.map((size) => (
              <col key={size.id} style={{ width: getColWidth(size.name, DEFAULT_SIZE_W) }} />
            ))}
            <col style={{ width: 60 }} />
          </colgroup>
          <thead>
            <tr>
              {/* Color header */}
              <th style={{ ...headerCellStyle, textAlign: "left" }}>
                Color
                <div
                  style={resizeHandle}
                  onMouseDown={(e) => startResize(e, COLOR_COL, DEFAULT_COLOR_W)}
                />
              </th>

              {/* Size headers */}
              {visibleSizes.map((size, idx) => {
                const realIdx = article.sizes.findIndex((s) => s.id === size.id);
                return (
                  <th key={size.id} style={headerCellStyle}>
                    {size.isNew && size.name === "" ? (
                      <input
                        type="text"
                        placeholder="Talle"
                        autoFocus
                        style={{
                          width: "calc(100% - 8px)",
                          background: "transparent",
                          border: "none",
                          color: "var(--text)",
                          outline: "none",
                          textAlign: "center",
                          fontSize: 12,
                        }}
                        onBlur={(e) => {
                          if (e.target.value) updateSizeName(realIdx, e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "center" }}>
                        {size.name}
                        <button
                          type="button"
                          onClick={() => toggleHideSize(size.name)}
                          title="Ocultar talle"
                          style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", padding: 0, lineHeight: 1 }}
                        >
                          <EyeOff size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSize(realIdx)}
                          style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", padding: 0, lineHeight: 1 }}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )}
                    <div
                      style={resizeHandle}
                      onMouseDown={(e) => startResize(e, size.name, DEFAULT_SIZE_W)}
                    />
                  </th>
                );
              })}

              {/* Add size */}
              <th style={headerCellStyle}>
                <button
                  type="button"
                  onClick={addSize}
                  style={{
                    background: "none",
                    border: "1px dashed var(--border2)",
                    color: "var(--text3)",
                    cursor: "pointer",
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontSize: 11,
                    whiteSpace: "nowrap",
                  }}
                >
                  + talle
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {article.rows.map((row) => (
              <tr key={row.id}>
                <td style={{ ...cellStyle, textAlign: "left", padding: "4px 8px", overflow: "hidden", maxWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <ComboBox
                      value={row.color}
                      options={allColors}
                      placeholder="Color..."
                      error={!row.color && article.sizes.some((s) => parseInt(row.quantities[s.name] || "0", 10) > 0)}
                      onChange={(v) => updateRow(row.id, { color: v })}
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      style={{ flexShrink: 0, background: "none", border: "none", color: "var(--text3)", cursor: "pointer", padding: 2 }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </td>
                {visibleSizes.map((size) => (
                  <td key={size.id} style={cellStyle}>
                    <input
                      type="number"
                      min={0}
                      value={row.quantities[size.name] ?? ""}
                      onChange={(e) => updateQty(row.id, size.name, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") e.currentTarget.blur();
                      }}
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        color: "var(--text)",
                        outline: "none",
                        textAlign: "center",
                        fontSize: 13,
                        padding: "2px",
                      }}
                    />
                    {article.priceGranular && (() => {
                      const hasSpecific = !!row.prices?.[size.name];
                      const hasFallback = !!article.price;
                      const missing = !hasSpecific && !hasFallback;
                      return (
                        <input
                          type="number"
                          min={0}
                          placeholder={missing ? "$ falta" : "$"}
                          value={row.prices?.[size.name] ?? ""}
                          onChange={(e) => {
                            const newPrices = { ...(row.prices || {}), [size.name]: e.target.value };
                            updateRow(row.id, { prices: newPrices });
                          }}
                          style={{
                            width: "100%",
                            background: missing ? "rgba(239,68,68,0.12)" : "transparent",
                            border: "none",
                            borderTop: `1px solid ${missing ? "var(--red)" : "var(--border)"}`,
                            color: missing ? "var(--red)" : "var(--text2)",
                            outline: "none",
                            textAlign: "center",
                            fontSize: 11,
                            padding: "2px",
                          }}
                        />
                      );
                    })()}
                  </td>
                ))}
                <td style={cellStyle} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add row */}
      <button
        type="button"
        onClick={addRow}
        style={{
          marginTop: 8,
          background: "none",
          border: "1px dashed var(--border2)",
          color: "var(--text3)",
          cursor: "pointer",
          padding: "4px 12px",
          borderRadius: 4,
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Plus size={12} /> color
      </button>
    </div>
  );
}
