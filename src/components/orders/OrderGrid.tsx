"use client";
import { useState, useEffect } from "react";
import { Button, Badge, Group, Text, Alert, Combobox, useCombobox, InputBase, Tooltip } from "@mantine/core";
import { Plus } from "lucide-react";
import { ArticleRow } from "./ArticleRow";
import { ConfirmModal } from "./ConfirmModal";
import { useAttributes } from "@/hooks/useAttributes";
import { useBrands } from "@/hooks/useBrands";
import { useCompradora } from "@/hooks/useCompradora";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Article, AttributeValue, Supplier, PrintColumn, PrintValues } from "@/types";

interface Props {
  supplier: Supplier | null;
  date: string;
  onTotalsChange?: (units: number, amount: number) => void;
}

interface AttrValidationError {
  articleName: string;
  type: "color" | "size";
  value: string;
}

function createEmptyArticle(
  globalBrand?: { attributeId: number; brand: AttributeValue } | null,
  globalCompradora?: { attributeId: number; compradora: AttributeValue } | null,
): Article {
  const attributes = [];
  if (globalBrand) {
    attributes.push({
      attributeId: globalBrand.attributeId,
      attributeName: "Marca",
      values: [globalBrand.brand],
      generatesVariants: false,
    });
  }
  if (globalCompradora) {
    attributes.push({
      attributeId: globalCompradora.attributeId,
      attributeName: "Compradora",
      values: [globalCompradora.compradora],
      generatesVariants: false,
    });
  }

  return {
    id: crypto.randomUUID(),
    name: "",
    existingProductId: null,
    referencia: "",
    price: "",
    salePrice: "",
    priceGranular: false,
    rows: [{ id: crypto.randomUUID(), color: null, quantities: {} }],
    sizes: [],
    attributes,
    description: "",
    maxCoeficiente: 0,
  };
}

export function OrderGrid({ supplier, date, onTotalsChange }: Props) {
  const [articles, setArticles] = useState<Article[]>([createEmptyArticle()]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [printColumns, setPrintColumns] = useState<PrintColumn[]>([]);
  const [printValues, setPrintValues] = useState<PrintValues>({});
  const [attrValidationErrors, setAttrValidationErrors] = useState<AttrValidationError[]>([]);
  const [globalBrand, setGlobalBrand] = useState<AttributeValue | null>(null);
  const [brandSearch, setBrandSearch] = useState("");
  const [globalCompradora, setGlobalCompradora] = useState<AttributeValue | null>(null);
  const [compradoaSearch, setCompradoaSearch] = useState("");

  const { data: attrData, isLoading: attrLoading, error: attrError, refetch: refetchAttrs } = useAttributes();
  const { data: brandsData } = useBrands();
  const { data: compradoaData } = useCompradora();

  const allColors = attrData?.colors || [];
  const allSizes = attrData?.sizes || [];
  const colorAttributeId = attrData?.colorAttributeId ?? 0;
  const sizeAttributeId = attrData?.sizeAttributeId ?? 0;
  const brandAttributeId = brandsData?.attributeId ?? 0;
  const allBrands = brandsData?.brands || [];
  const compradoaAttributeId = compradoaData?.attributeId ?? 0;
  const allCompradoas = compradoaData?.compradoras || [];

  const filteredBrands = allBrands.filter((b) =>
    b.name.toLowerCase().includes(brandSearch.toLowerCase()),
  );

  const filteredCompradoas = allCompradoas.filter((c) =>
    c.name.toLowerCase().includes(compradoaSearch.toLowerCase()),
  );

  const brandCombobox = useCombobox({
    onDropdownClose: () => brandCombobox.resetSelectedOption(),
  });

  const compradoaCombobox = useCombobox({
    onDropdownClose: () => compradoaCombobox.resetSelectedOption(),
  });

  function applyGlobalBrand(brand: AttributeValue | null) {
    setGlobalBrand(brand);
    if (!brand || !brandAttributeId) return;

    setArticles((prev) =>
      prev.map((a) => {
        const hasBrand = a.attributes.some((attr) =>
          attr.attributeName.toLowerCase().includes("marca"),
        );
        if (hasBrand) return a;
        return {
          ...a,
          attributes: [
            ...a.attributes,
            {
              attributeId: brandAttributeId,
              attributeName: "Marca",
              values: [brand],
              generatesVariants: false,
            },
          ],
        };
      }),
    );
  }

  function applyGlobalCompradora(compradora: AttributeValue | null) {
    setGlobalCompradora(compradora);
    if (!compradora || !compradoaAttributeId) return;

    setArticles((prev) =>
      prev.map((a) => {
        const hasCompradora = a.attributes.some((attr) =>
          attr.attributeName.toLowerCase().includes("compradora"),
        );
        if (hasCompradora) return a;
        return {
          ...a,
          attributes: [
            ...a.attributes,
            {
              attributeId: compradoaAttributeId,
              attributeName: "Compradora",
              values: [compradora],
              generatesVariants: false,
            },
          ],
        };
      }),
    );
  }

  function addPrintColumn() {
    setPrintColumns((prev) => [...prev, { id: crypto.randomUUID(), header: "" }]);
  }

  function updatePrintColumnHeader(id: string, header: string) {
    setPrintColumns((prev) =>
      prev.map((col) => (col.id === id ? { ...col, header } : col)),
    );
  }

  function removePrintColumn(id: string) {
    setPrintColumns((prev) => prev.filter((col) => col.id !== id));
    setPrintValues((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.includes(`:${id}`)) delete next[key];
      });
      return next;
    });
  }

  function updatePrintValue(articleId: string, rowId: string, columnId: string, value: string) {
    setPrintValues((prev) => ({
      ...prev,
      [`${articleId}:${rowId}:${columnId}`]: value,
    }));
  }

  function getPrintValue(articleId: string, rowId: string, columnId: string): string {
    return printValues[`${articleId}:${rowId}:${columnId}`] || "";
  }

  function updateArticle(id: string, updated: Article) {
    setArticles((prev) => prev.map((a) => (a.id === id ? updated : a)));
  }

  function removeArticle(id: string) {
    setArticles((prev) => prev.filter((a) => a.id !== id));
  }

  function addArticle() {
    const brandInfo =
      globalBrand && brandAttributeId
        ? { attributeId: brandAttributeId, brand: globalBrand }
        : null;
    const compradoaInfo =
      globalCompradora && compradoaAttributeId
        ? { attributeId: compradoaAttributeId, compradora: globalCompradora }
        : null;
    setArticles((prev) => [...prev, createEmptyArticle(brandInfo, compradoaInfo)]);
  }

  function validateAttributesExist(): AttrValidationError[] {
    const errors: AttrValidationError[] = [];

    for (const article of articles) {
      for (const row of article.rows) {
        if (!row.color) continue;
        const hasQty = article.sizes.some(
          (s) => parseInt(row.quantities[s.name] || "0", 10) > 0,
        );
        if (!hasQty) continue;

        const colorExists = allColors.some(
          (c) => c.name.toLowerCase() === row.color!.name.toLowerCase(),
        );
        if (!colorExists) {
          errors.push({ articleName: article.name, type: "color", value: row.color.name });
        }
      }

      for (const size of article.sizes) {
        const sizeExists = allSizes.some(
          (s) => s.name.toLowerCase() === size.name.toLowerCase(),
        );
        if (!sizeExists) {
          errors.push({ articleName: article.name, type: "size", value: size.name });
        }
      }
    }

    return errors;
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

  useEffect(() => {
    onTotalsChange?.(totalUnits, totalAmount);
  }, [totalUnits, totalAmount, onTotalsChange]);

  const hasDirtyData =
    articles.length > 1 ||
    (articles.length === 1 &&
      (articles[0].name.trim() !== "" ||
        articles[0].sizes.length > 0 ||
        articles[0].rows.some((r) =>
          Object.values(r.quantities).some((q) => parseInt(q || "0", 10) > 0),
        )));

  useEffect(() => {
    if (!hasDirtyData) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasDirtyData]);

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

  const missingBrand = articles.some((a) => {
    const hasQty = a.rows.some((r) =>
      a.sizes.some((s) => parseInt(r.quantities[s.name] || "0", 10) > 0),
    );
    if (!hasQty) return false;
    const brandAttr = a.attributes.find((attr) =>
      attr.attributeName.toLowerCase().includes("marca"),
    );
    return !brandAttr || brandAttr.values.length === 0;
  });

  const hasAnyQty = articles.some((a) =>
    a.rows.some((r) =>
      a.sizes.some((s) => {
        const qty = parseInt(r.quantities[s.name] || "0", 10);
        return qty > 0;
      }),
    ),
  );

  function getDisabledReason(): string | null {
    if (!supplier) return "Seleccioná un proveedor";
    if (!date) return "Seleccioná una fecha";
    if (!hasAnyQty) return "Ingresá al menos una cantidad";
    if (missingBrand) return "Todos los artículos deben tener Marca asignada";
    if (hasValidationErrors) return "Hay artículos con precio o color faltante";
    return null;
  }

  const disabledReason = getDisabledReason();

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
      {/* Brand + Compradora selectors */}
      {(allBrands.length > 0 || allCompradoas.length > 0) && (
        <Group mb="md" align="flex-end">
          {allBrands.length > 0 && (
            <div>
              <Text size="xs" c="dimmed" fw={500} mb={6}>
                Marca (global)
              </Text>
              <Combobox
                store={brandCombobox}
                onOptionSubmit={(val) => {
                  const brand = allBrands.find((b) => String(b.id) === val) || null;
                  setBrandSearch(brand?.name || "");
                  applyGlobalBrand(brand);
                  brandCombobox.closeDropdown();
                }}
                withinPortal
              >
                <Combobox.Target>
                  <InputBase
                    value={brandSearch}
                    placeholder="Seleccionar marca..."
                    size="sm"
                    w={200}
                    onChange={(e) => {
                      setBrandSearch(e.currentTarget.value);
                      brandCombobox.openDropdown();
                    }}
                    onFocus={() => brandCombobox.openDropdown()}
                    onBlur={() => {
                      brandCombobox.closeDropdown();
                      setBrandSearch(globalBrand?.name || "");
                    }}
                    rightSection={
                      globalBrand ? (
                        <ActionIconClear
                          onClick={() => {
                            setGlobalBrand(null);
                            setBrandSearch("");
                          }}
                        />
                      ) : null
                    }
                  />
                </Combobox.Target>
                <Combobox.Dropdown>
                  <Combobox.Options>
                    {filteredBrands.length > 0 ? (
                      filteredBrands.map((b) => (
                        <Combobox.Option key={b.id} value={String(b.id)}>
                          {b.name}
                        </Combobox.Option>
                      ))
                    ) : (
                      <Combobox.Empty>Sin resultados</Combobox.Empty>
                    )}
                  </Combobox.Options>
                </Combobox.Dropdown>
              </Combobox>
            </div>
          )}

          {allCompradoas.length > 0 && (
            <div>
              <Text size="xs" c="dimmed" fw={500} mb={6}>
                Compradora (global)
              </Text>
              <Combobox
                store={compradoaCombobox}
                onOptionSubmit={(val) => {
                  const compradora = allCompradoas.find((c) => String(c.id) === val) || null;
                  setCompradoaSearch(compradora?.name || "");
                  applyGlobalCompradora(compradora);
                  compradoaCombobox.closeDropdown();
                }}
                withinPortal
              >
                <Combobox.Target>
                  <InputBase
                    value={compradoaSearch}
                    placeholder="Seleccionar compradora..."
                    size="sm"
                    w={200}
                    onChange={(e) => {
                      setCompradoaSearch(e.currentTarget.value);
                      compradoaCombobox.openDropdown();
                    }}
                    onFocus={() => compradoaCombobox.openDropdown()}
                    onBlur={() => {
                      compradoaCombobox.closeDropdown();
                      setCompradoaSearch(globalCompradora?.name || "");
                    }}
                    rightSection={
                      globalCompradora ? (
                        <ActionIconClear
                          onClick={() => {
                            setGlobalCompradora(null);
                            setCompradoaSearch("");
                          }}
                        />
                      ) : null
                    }
                  />
                </Combobox.Target>
                <Combobox.Dropdown>
                  <Combobox.Options>
                    {filteredCompradoas.length > 0 ? (
                      filteredCompradoas.map((c) => (
                        <Combobox.Option key={c.id} value={String(c.id)}>
                          {c.name}
                        </Combobox.Option>
                      ))
                    ) : (
                      <Combobox.Empty>Sin resultados</Combobox.Empty>
                    )}
                  </Combobox.Options>
                </Combobox.Dropdown>
              </Combobox>
            </div>
          )}
        </Group>
      )}

      {/* Attribute validation errors */}
      {attrValidationErrors.length > 0 && (
        <Alert color="red" mb="md" title="Atributos no encontrados en Odoo">
          <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
            {attrValidationErrors.map((e, i) => (
              <li key={i}>
                <strong>{e.articleName}</strong> — {e.type === "color" ? "Color" : "Talle"}: &ldquo;{e.value}&rdquo;
              </li>
            ))}
          </ul>
          <Text size="xs" mt="xs">
            Estos valores deben ser creados en Odoo antes de continuar.
          </Text>
        </Alert>
      )}

      {/* Articles */}
      {articles.map((article) => {
        const artErrors = attrValidationErrors.filter((e) => e.articleName === article.name);
        return (
          <ArticleRow
            key={article.id}
            article={article}
            allColors={allColors}
            allSizes={allSizes}
            colorAttributeId={colorAttributeId}
            sizeAttributeId={sizeAttributeId}
            invalidColors={artErrors.filter((e) => e.type === "color").map((e) => e.value)}
            invalidSizes={artErrors.filter((e) => e.type === "size").map((e) => e.value)}
            printColumns={printColumns}
            onAddPrintColumn={addPrintColumn}
            onUpdatePrintColumnHeader={updatePrintColumnHeader}
            onRemovePrintColumn={removePrintColumn}
            getPrintValue={(rowId, columnId) => getPrintValue(article.id, rowId, columnId)}
            onUpdatePrintValue={(rowId, columnId, value) =>
              updatePrintValue(article.id, rowId, columnId, value)
            }
            onChange={(updated) => updateArticle(article.id, updated)}
            onRemove={() => removeArticle(article.id)}
            onOpenSizeModal={() => refetchAttrs()}
          />
        );
      })}

      {/* Add article */}
      <Button
        variant="subtle"
        color="gray"
        fullWidth
        leftSection={<Plus size={14} />}
        mb="xl"
        onClick={addArticle}
        style={{ border: "1px dashed var(--border2)" }}
      >
        Agregar artículo
      </Button>

      {/* Submit */}
      <Group justify="flex-end">
        <Tooltip
          label={disabledReason}
          disabled={!disabledReason}
          withArrow
        >
          <span>
            <Button
              color="amber"
              size="md"
              disabled={!!disabledReason}
              onClick={async () => {
                await refetchAttrs();
                const errors = validateAttributesExist();
                if (errors.length > 0) {
                  setAttrValidationErrors(errors);
                  return;
                }
                setAttrValidationErrors([]);
                setShowConfirm(true);
              }}
            >
              Revisar orden →
            </Button>
          </span>
        </Tooltip>
      </Group>

      {showConfirm && supplier && (
        <ConfirmModal
          supplier={supplier}
          date={date}
          articles={articles}
          printColumns={printColumns}
          printValues={printValues}
          onClose={() => setShowConfirm(false)}
          onConfirmed={() => {
            const brandInfo =
              globalBrand && brandAttributeId
                ? { attributeId: brandAttributeId, brand: globalBrand }
                : null;
            const compradoaInfo =
              globalCompradora && compradoaAttributeId
                ? { attributeId: compradoaAttributeId, compradora: globalCompradora }
                : null;
            setArticles([createEmptyArticle(brandInfo, compradoaInfo)]);
            setAttrValidationErrors([]);
            setShowConfirm(false);
          }}
          onValidationError={(errors) => {
            setAttrValidationErrors(errors);
          }}
        />
      )}
    </div>
  );
}

// Small inline clear button for comboboxes
function ActionIconClear({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text3)",
        display: "flex",
        alignItems: "center",
        padding: 0,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <path d="M9.5 2.5L6 6m0 0L2.5 9.5M6 6L9.5 9.5M6 6L2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </button>
  );
}
