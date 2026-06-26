"use client";
import { useState, useEffect } from "react";
import { Button, Badge, Group, Text, Alert, Combobox, useCombobox, InputBase, Tooltip, MultiSelect } from "@mantine/core";
import { Plus } from "lucide-react";
import { ArticleRow } from "./ArticleRow";
import { ConfirmModal } from "./ConfirmModal";
import { REQUIRED_ATTR_FAMILIES } from "./ArticleAttributes";
import { useAttributes } from "@/hooks/useAttributes";
import { useBrands } from "@/hooks/useBrands";
import { useCompradora } from "@/hooks/useCompradora";
import { useCategories } from "@/hooks/useCategories";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useSizeAttributes } from "@/hooks/useSizeAttributes";
import { useColorBaseOptions } from "@/hooks/useColorBaseOptions";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Article, AttributeValue, Supplier, PrintColumn, PrintValues, Warehouse } from "@/types";

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
      locked: true,
    });
  }
  if (globalCompradora) {
    attributes.push({
      attributeId: globalCompradora.attributeId,
      attributeName: "Compradora",
      values: [globalCompradora.compradora],
      generatesVariants: false,
      locked: true,
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
    category: null,
    rows: [{ id: crypto.randomUUID(), color: null, quantities: {}, warehouseQuantities: {} }],
    sizes: [],
    sizeAttributeId: null,
    attributes,
    description: "",
    colorImages: {},
    deletedOdooImageIds: [],
    clearedPrimaryColorNames: [],
    maxCoeficiente: 0,
  };
}

export function OrderGrid({ supplier, date, onTotalsChange }: Props) {
  const [articles, setArticles] = useState<Article[]>([]);
  useEffect(() => { setArticles([createEmptyArticle()]); }, []);
  const [showConfirm, setShowConfirm] = useState(false);
  const [printColumns, setPrintColumns] = useState<PrintColumn[]>([]);
  const [printValues, setPrintValues] = useState<PrintValues>({});
  const [attrValidationErrors, setAttrValidationErrors] = useState<AttrValidationError[]>([]);
  const [validateMode, setValidateMode] = useState(false);
  const [globalBrand, setGlobalBrand] = useState<AttributeValue | null>(null);
  const [brandSearch, setBrandSearch] = useState("");
  const [globalCompradora, setGlobalCompradora] = useState<AttributeValue | null>(null);
  const [compradoaSearch, setCompradoaSearch] = useState("");
  const [selectedWarehouses, setSelectedWarehouses] = useState<Warehouse[]>([]);

  const { data: attrData, isLoading: attrLoading, error: attrError, refetch: refetchAttrs } = useAttributes();
  const { data: sizeAttributes = [] } = useSizeAttributes();
  const { data: brandsData } = useBrands();
  const { data: compradoaData } = useCompradora();
  const { data: categories = [] } = useCategories();
  const { data: allWarehouses = [] } = useWarehouses();
  const { data: colorBaseOptions = [] } = useColorBaseOptions();

  const allColors = attrData?.colors || [];
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

  function duplicateArticle(id: string) {
    const original = articles.find((a) => a.id === id);
    if (!original) return;

    const duplicated: Article = {
      ...original,
      id: crypto.randomUUID(),
      name: "",
      referencia: "",
      existingProductId: null,
      colorImages: {},
      deletedOdooImageIds: [],
      clearedPrimaryColorNames: [],
      rows: original.rows.map((row) => ({
        ...row,
        id: crypto.randomUUID(),
        quantities: {},
        warehouseQuantities: {},
      })),
      sizes: original.sizes.map((size) => ({ ...size })),
      attributes: original.attributes.map((attr) => ({
        ...attr,
        values: [...attr.values],
      })),
    };

    setArticles((prev) => {
      const idx = prev.findIndex((a) => a.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, duplicated);
      return next;
    });
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

        // Skip new colors — they'll be created on confirm
        if (row.color.isNew) continue;

        const colorExists = allColors.some(
          (c) => c.name.toLowerCase() === row.color!.name.toLowerCase(),
        );
        if (!colorExists) {
          errors.push({ articleName: article.name, type: "color", value: row.color.name });
        }
      }

      const allSizeValues = sizeAttributes.flatMap((a) => a.values);
      for (const size of article.sizes) {
        const sizeExists = allSizeValues.some(
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
        if (selectedWarehouses.length > 0) {
          return s2 + Object.values(row.warehouseQuantities || {}).reduce(
            (s, v) => s + (parseInt(v || "0", 10) || 0), 0
          );
        }
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
      if (selectedWarehouses.length > 0) {
        return s2 + Object.entries(row.warehouseQuantities || {}).reduce((s3, [key, val]) => {
          const qty = parseInt(val || "0", 10);
          if (isNaN(qty) || qty <= 0) return s3;
          const sizeName = key.split(":").slice(1).join(":");
          let price: number;
          if (article.priceGranular) {
            const specific = row.prices?.[sizeName];
            price = specific ? parseFloat(specific) || 0 : parseFloat(article.price) || 0;
          } else {
            price = parseFloat(article.price) || 0;
          }
          return s3 + price * qty;
        }, 0);
      }
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

  function articleRowHasQty(article: Article, row: { quantities: Record<string, string>; warehouseQuantities?: Record<string, string> }): boolean {
    if (selectedWarehouses.length > 0) {
      return Object.values(row.warehouseQuantities || {}).some(
        (v) => parseInt(v || "0", 10) > 0,
      );
    }
    return article.sizes.some((s) => parseInt(row.quantities[s.name] || "0", 10) > 0);
  }

  function articleHasQty(article: Article): boolean {
    return article.rows.some((r) => articleRowHasQty(article, r));
  }

  const hasValidationErrors = articles.some((a) => {
    const hasQty = articleHasQty(a);
    const missingPrice = !a.priceGranular && !a.price && hasQty;
    const missingColor = a.rows.some((r) => articleRowHasQty(a, r) && !r.color);
    return missingPrice || missingColor;
  });

  const missingBrand = articles.some((a) => {
    if (!articleHasQty(a)) return false;
    const brandAttr = a.attributes.find((attr) =>
      attr.attributeName.toLowerCase().includes("marca"),
    );
    return !brandAttr || brandAttr.values.length === 0;
  });

  const hasAnyQty = articles.some((a) => articleHasQty(a));

  function getMissingRequiredKeys(article: Article): string[] {
    return REQUIRED_ATTR_FAMILIES
      .filter((family) =>
        !article.attributes.some(
          (attr) =>
            family.names.some((n) => attr.attributeName.toLowerCase().includes(n)) &&
            attr.values.length > 0,
        ),
      )
      .map((f) => f.key);
  }

  // Computed per article (always, not only in validateMode)
  const missingRequiredPerArticle: Record<string, string[]> = {};
  for (const article of articles) {
    const missing = getMissingRequiredKeys(article);
    if (missing.length > 0) missingRequiredPerArticle[article.id] = missing;
  }
  const hasMissingRequiredAttrs = Object.keys(missingRequiredPerArticle).length > 0;
  const firstMissingArticleId = articles.find((a) => missingRequiredPerArticle[a.id])?.id;

  const missingAttrLabels = [
    ...new Set(Object.values(missingRequiredPerArticle).flat()),
  ].map((key) => REQUIRED_ATTR_FAMILIES.find((f) => f.key === key)?.label ?? key);

  function getDisabledReason(): string | null {
    if (!supplier) return "Seleccioná un proveedor";
    if (!date) return "Seleccioná una fecha";
    if (!hasAnyQty) return "Ingresá al menos una cantidad";

    const missingSalePrice = articles.some((a) => articleHasQty(a) && !a.salePrice);
    if (missingSalePrice) return "Todos los artículos deben tener Precio de Venta";

    const missingCategory = articles.some((a) => articleHasQty(a) && !a.category);
    if (missingCategory) return "Todos los artículos deben tener Categoría asignada";

    const missingSizeAttr = articles.some((a) => articleHasQty(a) && !a.sizeAttributeId);
    if (missingSizeAttr) return "Todos los artículos deben tener tipo de talle seleccionado";

    if (missingBrand) return "Todos los artículos deben tener Marca asignada";
    if (hasValidationErrors) return "Hay artículos con precio o color faltante";

    const missingColorBaseOrHex = articles.some((a) =>
      a.rows.some(
        (r) =>
          r.color?.isNew &&
          (!r.color.colorBase || !r.color.hexColor),
      ),
    );
    if (missingColorBaseOrHex)
      return "Hay colores nuevos sin Color Base o HEX asignado";

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
      {/* Brand + Compradora + Sucursales selectors */}
      {(allBrands.length > 0 || allCompradoas.length > 0 || allWarehouses.length > 0) && (
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
                    onKeyDown={(e) => {
                      if (!brandCombobox.dropdownOpened) return;
                      if ((e.key === "Tab" || e.key === "ArrowDown") && filteredBrands.length > 0) {
                        e.preventDefault();
                        brandCombobox.selectNextOption();
                      } else if (e.key === "ArrowUp" && filteredBrands.length > 0) {
                        e.preventDefault();
                        brandCombobox.selectPreviousOption();
                      } else if (e.key === "Enter" && filteredBrands.length > 0) {
                        e.preventDefault();
                        if (filteredBrands.length === 1) {
                          const brand = filteredBrands[0];
                          setBrandSearch(brand.name);
                          applyGlobalBrand(brand);
                          brandCombobox.closeDropdown();
                        } else {
                          brandCombobox.clickSelectedOption();
                        }
                      }
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
                  <Combobox.Options mah={200} style={{ overflowY: "auto", overscrollBehavior: "contain" }}>
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
                    onKeyDown={(e) => {
                      if (!compradoaCombobox.dropdownOpened) return;
                      if ((e.key === "Tab" || e.key === "ArrowDown") && filteredCompradoas.length > 0) {
                        e.preventDefault();
                        compradoaCombobox.selectNextOption();
                      } else if (e.key === "ArrowUp" && filteredCompradoas.length > 0) {
                        e.preventDefault();
                        compradoaCombobox.selectPreviousOption();
                      } else if (e.key === "Enter" && filteredCompradoas.length > 0) {
                        e.preventDefault();
                        if (filteredCompradoas.length === 1) {
                          const compradora = filteredCompradoas[0];
                          setCompradoaSearch(compradora.name);
                          applyGlobalCompradora(compradora);
                          compradoaCombobox.closeDropdown();
                        } else {
                          compradoaCombobox.clickSelectedOption();
                        }
                      }
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
                  <Combobox.Options mah={200} style={{ overflowY: "auto", overscrollBehavior: "contain" }}>
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

          {allWarehouses.length > 0 && (
            <div>
              <Text size="xs" c="dimmed" fw={500} mb={6}>
                Sucursales (global)
              </Text>
              <MultiSelect
                placeholder="Seleccionar sucursales..."
                data={allWarehouses.map((w) => ({
                  value: String(w.id),
                  label: w.name,
                }))}
                value={selectedWarehouses.map((w) => String(w.id))}
                onChange={(vals) => {
                  const selected = allWarehouses.filter((w) =>
                    vals.includes(String(w.id)),
                  );
                  setSelectedWarehouses(selected);
                }}
                w={260}
                size="sm"
                clearable
              />
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
            colorBaseOptions={colorBaseOptions}
            sizeAttributes={sizeAttributes}
            colorAttributeId={colorAttributeId}
            sizeAttributeId={sizeAttributeId}
            categories={categories}
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
            selectedWarehouses={selectedWarehouses}
            onChange={(updated) => updateArticle(article.id, updated)}
            onRemove={() => removeArticle(article.id)}
            onDuplicate={() => duplicateArticle(article.id)}
            onOpenSizeModal={() => refetchAttrs()}
            missingRequiredKeys={validateMode ? (missingRequiredPerArticle[article.id] ?? []) : []}
            isFirstMissingArticle={validateMode && article.id === firstMissingArticleId}
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
          label={
            disabledReason ||
            (validateMode && hasMissingRequiredAttrs
              ? `Faltan atributos: ${missingAttrLabels.join(", ")}`
              : null)
          }
          disabled={!disabledReason && !(validateMode && hasMissingRequiredAttrs)}
          withArrow
        >
          <span>
            <Button
              color="amber"
              size="md"
              disabled={!!disabledReason || (validateMode && hasMissingRequiredAttrs)}
              onClick={async () => {
                if (hasMissingRequiredAttrs) {
                  setValidateMode(true);
                  return;
                }
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
          selectedWarehouses={selectedWarehouses}
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
