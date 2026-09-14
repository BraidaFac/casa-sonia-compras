"use client";
import { useState, useEffect } from "react";
import { Combobox, TextInput, Tooltip, useCombobox } from "@mantine/core";
import type { ProductCategory } from "@/types";

interface Props {
  categories: ProductCategory[];
  value: ProductCategory | null;
  onChange: (cat: ProductCategory | null) => void;
  /** Called instead of onChange when the article has images and the category changes */
  onImageWarning?: (cat: ProductCategory) => void;
  hasImages?: boolean;
  error?: boolean;
  size?: "xs" | "sm" | "md";
  w?: number;
}

const normStr = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function CategoryCombobox({
  categories,
  value,
  onChange,
  onImageWarning,
  hasImages = false,
  error,
  size = "xs",
  w = 220,
}: Props) {
  const leafCategories = categories
    .filter((c) => c.isLeaf)
    .sort((a, b) => a.completeName.localeCompare(b.completeName, "es"));

  const [search, setSearch] = useState(value?.name ?? "");

  useEffect(() => {
    setSearch(value?.name ?? "");
  }, [value]);

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const filtered = leafCategories.filter((cat) => {
    const haystack = normStr(cat.completeName);
    const words = search.trim().split(/\s+/).filter(Boolean);
    return words.length === 0 || words.every((w) => haystack.includes(normStr(w)));
  });

  function selectCat(cat: ProductCategory) {
    const isSame = cat.id === value?.id;
    if (!isSame && hasImages && onImageWarning) {
      onImageWarning(cat);
    } else {
      onChange(cat);
    }
    combobox.closeDropdown();
  }

  function handleOptionSubmit(val: string) {
    const cat = filtered.find((c) => String(c.id) === val);
    if (cat) selectCat(cat);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!combobox.dropdownOpened) return;
    if ((e.key === "Tab" || e.key === "ArrowDown") && filtered.length > 0) {
      e.preventDefault();
      combobox.selectNextOption();
    } else if (e.key === "ArrowUp" && filtered.length > 0) {
      e.preventDefault();
      combobox.selectPreviousOption();
    } else if (e.key === "Enter" && filtered.length > 0) {
      e.preventDefault();
      if (filtered.length === 1) {
        selectCat(filtered[0]);
      } else {
        combobox.clickSelectedOption();
      }
    }
  }

  return (
    <Combobox store={combobox} onOptionSubmit={handleOptionSubmit} withinPortal>
      <Combobox.Target>
        <Tooltip label={value?.completeName} disabled={!value} withArrow position="top">
          <TextInput
            label="Categoría"
            placeholder="Buscar categoría..."
            size={size}
            w={w}
            value={search}
            error={error}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              if (value && e.currentTarget.value !== value.name) {
                onChange(null);
              }
              combobox.openDropdown();
            }}
            onFocus={() => combobox.openDropdown()}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              combobox.closeDropdown();
              setSearch(value?.name ?? "");
            }}
          />
        </Tooltip>
      </Combobox.Target>
      <Combobox.Dropdown style={{ minWidth: 320 }}>
        <Combobox.Options mah={240} style={{ overflowY: "auto" }}>
          {filtered.length > 0 ? (
            filtered.map((cat) => (
              <Combobox.Option key={cat.id} value={String(cat.id)}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{cat.name}</span>
                  {cat.completeName !== cat.name && (
                    <div style={{ color: "var(--text3)", fontSize: 11 }}>
                      {cat.completeName}
                    </div>
                  )}
                </div>
              </Combobox.Option>
            ))
          ) : (
            <Combobox.Empty>Sin resultados</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
