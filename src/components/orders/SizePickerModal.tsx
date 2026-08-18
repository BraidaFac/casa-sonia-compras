"use client";
import { useState, useEffect, useMemo } from "react";
import { Modal, Text, Button } from "@mantine/core";
import {
  buildHierarchy,
  sortLetterValues,
  type SizeHierarchy,
  type ClassifiedValue,
} from "@/lib/size-classifier";
import type { SizeAttribute, SizeValue } from "@/app/api/size-attributes/route";

interface Props {
  opened: boolean;
  onClose: () => void;
  sizeAttributes: SizeAttribute[];
  currentSizes: SizeValue[];
  currentSizeAttributeId: number | null;
  onConfirm: (sizes: SizeValue[], sizeAttributeId: number) => void;
}

// ── Keyframes injected once ───────────────────────────────────────────────────
const STYLE_ID = "size-picker-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes sp-fadein {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .sp-step { animation: sp-fadein 0.18s ease-out both; }

    @media (prefers-reduced-motion: reduce) {
      .sp-step { animation: none; }
    }

    .sp-attr-card {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 16px;
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s;
      text-align: left;
      width: 100%;
    }
    .sp-attr-card:hover {
      background: var(--surface3);
      border-color: var(--border2);
    }
    .sp-attr-card:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .sp-type-card {
      flex: 1;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px 16px;
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .sp-type-card:hover {
      background: var(--surface3);
      border-color: var(--accent);
    }
    .sp-type-card:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .sp-chip {
      border-radius: 6px;
      border: 1px solid var(--border2);
      background: var(--surface2);
      color: var(--text2);
      cursor: pointer;
      transition: background 0.1s, border-color 0.1s, color 0.1s, transform 0.08s;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-width: 52px;
      padding: 6px 12px;
      font-family: var(--font-sans);
      user-select: none;
    }
    .sp-chip:hover:not(.sp-chip--selected) {
      background: var(--surface3);
      border-color: var(--border2);
      color: var(--text);
    }
    .sp-chip--selected {
      background: var(--accent);
      border-color: var(--accent);
      color: #1c1917;
    }
    .sp-chip:active {
      transform: scale(0.95);
    }
    .sp-chip:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .sp-back-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--text3);
      font-size: 13px;
      cursor: pointer;
      padding: 2px 6px 2px 2px;
      border-radius: 4px;
      border: none;
      background: none;
      transition: color 0.12s, background 0.12s;
    }
    .sp-back-btn:hover {
      color: var(--text2);
      background: var(--surface3);
    }
    .sp-back-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
  `;
  document.head.appendChild(s);
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function Breadcrumb({ parts }: { parts: string[] }) {
  if (parts.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {parts.map((p, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {i > 0 && (
            <span style={{ color: "var(--text3)", fontSize: 12 }}>›</span>
          )}
          <span
            style={{
              fontSize: 12,
              padding: "1px 8px",
              borderRadius: 4,
              background: i === parts.length - 1 ? "var(--accent-bg)" : "transparent",
              color: i === parts.length - 1 ? "var(--accent)" : "var(--text3)",
              fontWeight: i === parts.length - 1 ? 600 : 400,
            }}
          >
            {p}
          </span>
        </span>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function SizePickerModal({
  opened,
  onClose,
  sizeAttributes,
  currentSizes,
  currentSizeAttributeId,
  onConfirm,
}: Props) {
  const [selectedAttribute, setSelectedAttribute] = useState<SizeAttribute | null>(null);
  const [selectedType, setSelectedType] = useState<"letter" | "numeric" | null>(null);
  const [selectedSuffix, setSelectedSuffix] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null);
  const [stepKey, setStepKey] = useState(0);

  useEffect(() => {
    if (!opened) return;
    if (currentSizeAttributeId) {
      const attr = sizeAttributes.find((a) => a.id === currentSizeAttributeId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (attr) setSelectedAttribute(attr);
    }
     
    setSelectedIds(new Set(currentSizes.map((s) => s.id)));
     
    setSelectedType(null);
     
    setSelectedSuffix(null);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const hierarchy: SizeHierarchy | null = useMemo(() => {
    if (!selectedAttribute) return null;
    return buildHierarchy(selectedAttribute.values);
  }, [selectedAttribute]);

  function advance() {
    setStepKey((k) => k + 1);
  }

  function handleSelectAttribute(attr: SizeAttribute) {
    advance();
    setSelectedAttribute(attr);
    setSelectedType(null);
    setSelectedSuffix(null);
    setLastClickedIdx(null);
    if (attr.id !== currentSizeAttributeId) {
      setSelectedIds(new Set());
    }
  }

  function handleChipClick(idx: number, id: number, e: React.MouseEvent) {
    if (e.shiftKey && lastClickedIdx !== null) {
      const from = Math.min(lastClickedIdx, idx);
      const to = Math.max(lastClickedIdx, idx);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        candidates.slice(from, to + 1).forEach((cv) => next.add(cv.value.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastClickedIdx(idx);
    }
  }

  const showTypePicker = useMemo(() => {
    if (!hierarchy || !selectedAttribute) return false;
    if (selectedType !== null || selectedSuffix !== null) return false;
    return hierarchy.hasLetters && (hierarchy.hasNumerics || hierarchy.hasSuffixes);
  }, [hierarchy, selectedAttribute, selectedType, selectedSuffix]);

  const showSuffixPicker = useMemo(() => {
    if (!hierarchy || !selectedAttribute) return false;
    if (selectedSuffix !== null) return false;
    if (!hierarchy.hasSuffixes) return false;
    if (selectedType === "numeric") return true;
    if (!hierarchy.hasLetters && !hierarchy.hasNumerics && hierarchy.hasSuffixes) return true;
    return false;
  }, [hierarchy, selectedAttribute, selectedType, selectedSuffix]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const candidates: ClassifiedValue[] = useMemo(() => {
    if (!hierarchy || !selectedAttribute) return [];
    if (hierarchy.hasLetters && !hierarchy.hasNumerics && !hierarchy.hasSuffixes)
      return sortLetterValues(hierarchy.letters);
    if (!hierarchy.hasLetters && hierarchy.hasNumerics && !hierarchy.hasSuffixes)
      return hierarchy.numerics;
    if (!hierarchy.hasLetters && !hierarchy.hasNumerics && hierarchy.hasSuffixes) {
      if (selectedSuffix) return hierarchy.suffixGroups[selectedSuffix] || [];
      return [];
    }
    if (selectedType === "letter") return sortLetterValues(hierarchy.letters);
    if (selectedType === "numeric") {
      if (hierarchy.hasSuffixes) {
        if (selectedSuffix) return hierarchy.suffixGroups[selectedSuffix] || [];
        return [];
      }
      return hierarchy.numerics;
    }
    return [];
  }, [hierarchy, selectedType, selectedSuffix, selectedAttribute]);

  const showCandidates = candidates.length > 0;

  const breadcrumb: string[] = [];
  if (selectedAttribute) breadcrumb.push(selectedAttribute.name);
  if (selectedType) breadcrumb.push(selectedType === "letter" ? "Letras" : "Numérico");
  if (selectedSuffix) breadcrumb.push(selectedSuffix);

  const canGoBack = selectedAttribute !== null;

  function goBack() {
    advance();
    if (selectedSuffix) { setSelectedSuffix(null); return; }
    if (selectedType) { setSelectedType(null); return; }
    if (selectedAttribute) { setSelectedAttribute(null); setSelectedIds(new Set()); return; }
  }

  function handleConfirm() {
    if (!selectedAttribute || !hierarchy) return;
    const sortedAll = [
      ...sortLetterValues(hierarchy.letters).map((cv) => cv.value),
      ...hierarchy.numerics.map((cv) => cv.value),
      ...hierarchy.suffixes.flatMap((s) =>
        hierarchy.suffixGroups[s].map((cv) => cv.value),
      ),
    ];
    const selectedValues = sortedAll.filter((v) => selectedIds.has(v.id));
    onConfirm(selectedValues, selectedAttribute.id);
  }

  // ── Derived step label ──────────────────────────────────────────────────────
  const stepLabel = (() => {
    if (!selectedAttribute) return "Tipo de talle";
    if (showTypePicker) return "Sistema";
    if (showSuffixPicker) return "Medida";
    return "Talles";
  })();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {canGoBack && (
            <button type="button" className="sp-back-btn" onClick={goBack} aria-label="Volver">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Volver
            </button>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Text size="sm" fw={600} style={{ color: "var(--text)", lineHeight: 1.2 }}>
              Seleccionar talles
            </Text>
            {breadcrumb.length > 0 && <Breadcrumb parts={breadcrumb} />}
          </div>
        </div>
      }
      centered
      size="md"
      styles={{
        header: {
          paddingBottom: 12,
          borderBottom: "1px solid var(--border)",
          marginBottom: 0,
        },
        body: {
          padding: "20px 20px 16px",
        },
      }}
    >
      {/* ── Step 1: Attribute selection ─────────────────────────────────────── */}
      {!selectedAttribute && (
        <div key={`attr-${stepKey}`} className="sp-step">
          <Text
            size="xs"
            style={{
              color: "var(--text3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            {stepLabel}
          </Text>

          {sizeAttributes.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                background: "var(--surface2)",
                borderRadius: 8,
                border: "1px dashed var(--border2)",
              }}
            >
              <Text size="sm" style={{ color: "var(--text3)" }}>
                No hay atributos de talle en Odoo.
              </Text>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
              {sizeAttributes.map((attr) => (
                <button
                  key={attr.id}
                  type="button"
                  className="sp-attr-card"
                  onClick={() => handleSelectAttribute(attr)}
                >
                  <Text size="sm" fw={500} style={{ color: "var(--text)" }}>
                    {attr.name}
                  </Text>
                  <Text size="xs" style={{ color: "var(--text3)", marginTop: 2 }}>
                    {attr.values?.length ?? 0} talles
                  </Text>
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
            <Button variant="default" size="sm" onClick={onClose} style={{ whiteSpace: "nowrap" }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2a: Letter vs Numeric ──────────────────────────────────────── */}
      {selectedAttribute && showTypePicker && (
        <div key={`type-${stepKey}`} className="sp-step">
          <Text
            size="xs"
            style={{
              color: "var(--text3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            {stepLabel}
          </Text>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="sp-type-card"
              onClick={() => { advance(); setSelectedType("letter"); }}
            >
              <span style={{ fontSize: 22, letterSpacing: "-0.03em", color: "var(--text)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                S·M·L
              </span>
              <Text size="sm" fw={500} style={{ color: "var(--text2)" }}>Letras</Text>
            </button>

            <button
              type="button"
              className="sp-type-card"
              onClick={() => { advance(); setSelectedType("numeric"); }}
            >
              <span style={{ fontSize: 22, letterSpacing: "-0.03em", color: "var(--text)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                32·36
              </span>
              <Text size="sm" fw={500} style={{ color: "var(--text2)" }}>Numérico</Text>
            </button>
          </div>

          <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
            <Button variant="default" size="sm" onClick={onClose} style={{ whiteSpace: "nowrap" }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2b: Suffix / measurement system ───────────────────────────── */}
      {selectedAttribute && showSuffixPicker && hierarchy && (
        <div key={`suffix-${stepKey}`} className="sp-step">
          <Text
            size="xs"
            style={{
              color: "var(--text3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            {stepLabel}
          </Text>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
            {hierarchy.suffixes.map((suffix) => (
              <button
                key={suffix}
                type="button"
                className="sp-attr-card"
                onClick={() => { advance(); setSelectedSuffix(suffix); }}
                style={{ textAlign: "center", padding: "16px 12px" }}
              >
                <Text size="sm" fw={600} style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>
                  {suffix}
                </Text>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
            <Button variant="default" size="sm" onClick={onClose} style={{ whiteSpace: "nowrap" }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Size chips ──────────────────────────────────────────────── */}
      {selectedAttribute && showCandidates && (
        <div key={`chips-${stepKey}`} className="sp-step">
          {/* Hint */}
          <Text
            size="xs"
            style={{ color: "var(--text3)", marginBottom: 12 }}
          >
            Click para seleccionar · Shift+click para rango
          </Text>

          {/* Chip grid */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              maxHeight: 280,
              overflowY: "auto",
              paddingRight: 2,
            }}
          >
            {candidates.map((cv, idx) => {
              const isSelected = selectedIds.has(cv.value.id);
              return (
                <button
                  key={cv.value.id}
                  type="button"
                  className={`sp-chip${isSelected ? " sp-chip--selected" : ""}`}
                  onClick={(e) => handleChipClick(idx, cv.value.id, e)}
                  aria-pressed={isSelected}
                >
                  <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, lineHeight: 1.2 }}>
                    {cv.value.name}
                  </span>
                  {cv.value.equivalencia && (
                    <span
                      style={{
                        fontSize: 10,
                        opacity: isSelected ? 0.7 : 0.55,
                        lineHeight: 1,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {cv.value.equivalencia}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer bar */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* Utility actions */}
            <button
              type="button"
              onClick={() => setSelectedIds(new Set(candidates.map((c) => c.value.id)))}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text3)",
                fontSize: 12,
                fontFamily: "var(--font-sans)",
                padding: "4px 6px",
                borderRadius: 4,
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "color 0.12s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--text2)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text3)")}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text3)",
                fontSize: 12,
                fontFamily: "var(--font-sans)",
                padding: "4px 6px",
                borderRadius: 4,
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "color 0.12s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--text2)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text3)")}
            >
              Limpiar
            </button>

            {/* Count badge */}
            <div
              style={{
                marginLeft: 4,
                padding: "2px 8px",
                borderRadius: 4,
                background: selectedIds.size > 0 ? "var(--accent-bg)" : "transparent",
                border: selectedIds.size > 0 ? "1px solid rgba(217,119,6,0.25)" : "1px solid transparent",
                transition: "background 0.15s, border-color 0.15s",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <Text
                size="xs"
                style={{
                  color: selectedIds.size > 0 ? "var(--accent)" : "var(--text3)",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  transition: "color 0.15s",
                }}
              >
                {selectedIds.size} sel.
              </Text>
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Primary actions */}
            <Button
              variant="default"
              size="sm"
              onClick={onClose}
              style={{ whiteSpace: "nowrap", flexShrink: 0 }}
            >
              Cancelar
            </Button>
            <Button
              color="amber"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={handleConfirm}
              style={{ whiteSpace: "nowrap", flexShrink: 0 }}
            >
              Confirmar ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
