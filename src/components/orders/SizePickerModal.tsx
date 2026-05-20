"use client";
import { useState, useEffect, useMemo } from "react";
import {
  Modal,
  Stack,
  Text,
  Group,
  Button,
} from "@mantine/core";
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

  useEffect(() => {
    if (!opened) return;

    if (currentSizeAttributeId) {
      const attr = sizeAttributes.find((a) => a.id === currentSizeAttributeId);
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

  function handleSelectAttribute(attr: SizeAttribute) {
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

  // Determine what step we're on and what candidates to show
  const showTypePicker = useMemo(() => {
    if (!hierarchy || !selectedAttribute) return false;
    if (selectedType !== null || selectedSuffix !== null) return false;
    // Need to pick type if has both letters AND (numerics or suffixes)
    return hierarchy.hasLetters && (hierarchy.hasNumerics || hierarchy.hasSuffixes);
  }, [hierarchy, selectedAttribute, selectedType, selectedSuffix]);

  const showSuffixPicker = useMemo(() => {
    if (!hierarchy || !selectedAttribute) return false;
    if (selectedSuffix !== null) return false;
    if (!hierarchy.hasSuffixes) return false;
    // Show suffixes if: picked "numeric" type (and has suffixes), or directly has only suffixes
    if (selectedType === "numeric") return true;
    if (!hierarchy.hasLetters && !hierarchy.hasNumerics && hierarchy.hasSuffixes) return true;
    return false;
  }, [hierarchy, selectedAttribute, selectedType, selectedSuffix]);

  const candidates: ClassifiedValue[] = useMemo(() => {
    if (!hierarchy || !selectedAttribute) return [];

    // Only letters (no numerics, no suffixes)
    if (hierarchy.hasLetters && !hierarchy.hasNumerics && !hierarchy.hasSuffixes) {
      return sortLetterValues(hierarchy.letters);
    }

    // Only numerics (no letters, no suffixes)
    if (!hierarchy.hasLetters && hierarchy.hasNumerics && !hierarchy.hasSuffixes) {
      return hierarchy.numerics;
    }

    // Only suffixes
    if (!hierarchy.hasLetters && !hierarchy.hasNumerics && hierarchy.hasSuffixes) {
      if (selectedSuffix) return hierarchy.suffixGroups[selectedSuffix] || [];
      return [];
    }

    // Mixed
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

  // Breadcrumb
  const breadcrumb: string[] = [];
  if (selectedAttribute) breadcrumb.push(selectedAttribute.name);
  if (selectedType) breadcrumb.push(selectedType === "letter" ? "Letras" : "Numérico");
  if (selectedSuffix) breadcrumb.push(selectedSuffix);

  function goBack() {
    if (selectedSuffix) { setSelectedSuffix(null); return; }
    if (selectedType) { setSelectedType(null); return; }
    if (selectedAttribute) { setSelectedAttribute(null); setSelectedIds(new Set()); return; }
  }

  const canGoBack = selectedAttribute !== null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs" align="center">
          {canGoBack && (
            <button
              type="button"
              onClick={goBack}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text3)",
                fontSize: 16,
                padding: "0 4px",
                lineHeight: 1,
              }}
            >
              ←
            </button>
          )}
          <Text size="sm" fw={600}>
            {breadcrumb.length > 0 ? breadcrumb.join(" › ") : "Seleccionar talles"}
          </Text>
        </Group>
      }
      centered
      size="md"
    >
      <Stack gap="md">
        {/* Step 1: Choose attribute */}
        {!selectedAttribute && (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">Seleccioná el tipo de talle</Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {sizeAttributes.length === 0 && (
                <Text size="sm" c="dimmed">No hay atributos de talle en Odoo.</Text>
              )}
              {sizeAttributes.map((attr) => (
                <Button
                  key={attr.id}
                  variant="outline"
                  color="amber"
                  size="sm"
                  onClick={() => handleSelectAttribute(attr)}
                >
                  {attr.name}
                </Button>
              ))}
            </div>
          </Stack>
        )}

        {/* Step 2a: Type picker (letters vs numeric) */}
        {selectedAttribute && showTypePicker && (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">¿Qué tipo de talle?</Text>
            <Group>
              <Button
                variant="outline"
                color="amber"
                onClick={() => setSelectedType("letter")}
              >
                Letras
              </Button>
              <Button
                variant="outline"
                color="amber"
                onClick={() => setSelectedType("numeric")}
              >
                Numérico
              </Button>
            </Group>
          </Stack>
        )}

        {/* Step 2b: Suffix picker */}
        {selectedAttribute && showSuffixPicker && hierarchy && (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">¿Sistema de medida?</Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {hierarchy.suffixes.map((suffix) => (
                <Button
                  key={suffix}
                  variant="outline"
                  color="amber"
                  size="sm"
                  onClick={() => setSelectedSuffix(suffix)}
                >
                  {suffix}
                </Button>
              ))}
            </div>
          </Stack>
        )}

        {/* Step 3: Size chips */}
        {selectedAttribute && showCandidates && (
          <Stack gap="sm">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {candidates.map((cv, idx) => {
                const isSelected = selectedIds.has(cv.value.id);
                return (
                  <button
                    key={cv.value.id}
                    type="button"
                    onClick={(e) => handleChipClick(idx, cv.value.id, e)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 20,
                      border: `1px solid ${isSelected ? "var(--accent)" : "var(--border2)"}`,
                      background: isSelected ? "var(--accent)" : "var(--surface2)",
                      color: isSelected ? "#1c1917" : "var(--text2)",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: isSelected ? 600 : 400,
                      transition: "all 0.15s",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <span>{cv.value.name}</span>
                    {cv.value.equivalencia && (
                      <span style={{ fontSize: 10, opacity: 0.7 }}>
                        {cv.value.equivalencia}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <Group gap="xs">
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                onClick={() => setSelectedIds(new Set(candidates.map((c) => c.value.id)))}
              >
                Seleccionar todos
              </Button>
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                onClick={() => setSelectedIds(new Set())}
              >
                Limpiar
              </Button>
              <Text size="xs" c="dimmed" style={{ marginLeft: "auto", alignSelf: "center" }}>
                {selectedIds.size} talle{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""}
              </Text>
            </Group>
          </Stack>
        )}

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            color="amber"
            disabled={selectedIds.size === 0 || !selectedAttribute}
            onClick={() => {
              if (!selectedAttribute) return;
              const selectedValues = selectedAttribute.values.filter((v) =>
                selectedIds.has(v.id),
              );
              onConfirm(selectedValues, selectedAttribute.id);
            }}
          >
            Confirmar ({selectedIds.size})
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
