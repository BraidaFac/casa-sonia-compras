"use client";
import { useState, useEffect, useRef } from "react";
import {
  Combobox,
  useCombobox,
  ActionIcon,
  Popover,
  Tooltip,
} from "@mantine/core";
import { Pencil } from "lucide-react";
import type { ColorValue } from "@/types";

interface Props {
  value: ColorValue | null;
  allColors: ColorValue[];
  colorBaseOptions: string[];
  onChange: (color: ColorValue | null) => void;
  hasQty: boolean;
}

export function ColorProveedorCell({
  value,
  allColors,
  onChange,
  hasQty,
}: Props) {
  const [search, setSearch] = useState(value?.name || "");
  const [isSuggestingHex, setIsSuggestingHex] = useState(false);
  const [hexSuggestions, setHexSuggestions] = useState<string[]>([]);
  const [hexPopoverOpen, setHexPopoverOpen] = useState(false);
  const dropdownOpenRef = useRef(false);

  const combobox = useCombobox({
    onDropdownOpen: () => { dropdownOpenRef.current = true; },
    onDropdownClose: () => {
      dropdownOpenRef.current = false;
      combobox.resetSelectedOption();
    },
  });

  // Sync search when value changes from outside (e.g. product selection)
  const prevValueNameRef = useRef(value?.name);
  useEffect(() => {
    if (value?.name !== prevValueNameRef.current) {
      prevValueNameRef.current = value?.name;
      if (!dropdownOpenRef.current) {
        setSearch(value?.name || "");
      }
    }
  }, [value]);

  const filteredColors = allColors.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const isExactMatch = allColors.some(
    (c) => c.name.toLowerCase() === search.toLowerCase(),
  );
  const showCreateOption = search.trim() !== "" && !isExactMatch;

  async function handleSuggestHex() {
    if (!value?.name) return;
    setIsSuggestingHex(true);
    try {
      const res = await fetch("/api/suggest-hex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colorName: value.name }),
      });
      if (!res.ok) throw new Error("Error sugiriendo HEX");
      const { hexColors } = await res.json();
      setHexSuggestions(hexColors);
      if (hexColors.length > 0 && !value.hexColor) {
        onChange({ ...value, hexColor: hexColors[0] });
      }
      setHexPopoverOpen(true);
    } catch {
      // silenciar — no crítico
    } finally {
      setIsSuggestingHex(false);
    }
  }

  const hasError = !value && hasQty;
  const showControls = !!(value?.name || search.trim());

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(val) => {
        if (val === "__create__") {
          const trimmed = search.trim();
          const name = trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
          onChange({
            id: null,
            name,
            colorBase: "",
            hexColor: "",
            isNew: true,
          });
          combobox.closeDropdown();
          return;
        }
        const selected = allColors.find((c) => String(c.id) === val);
        if (selected) {
          onChange(selected);
          setSearch(selected.name);
          prevValueNameRef.current = selected.name;
        }
        combobox.closeDropdown();
      }}
      withinPortal
    >
      {/* Input row — name + circle + pencil inline */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Combobox.Target>
          <input
            type="text"
            value={search}
            placeholder="Color proveedor..."
            onChange={(e) => {
              const raw = e.target.value;
              const capitalized = raw.length > 0 ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
              setSearch(capitalized);
              if (value && capitalized !== value.name) {
                onChange(null);
              }
              combobox.openDropdown();
            }}
            onFocus={() => combobox.openDropdown()}
            onBlur={() => {
              combobox.closeDropdown();
              if (!value) setSearch("");
              else setSearch(value.name);
            }}
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              borderBottom: hasError ? "1px solid var(--red)" : "none",
              color: "var(--text)",
              outline: "none",
              fontSize: 13,
            }}
          />
        </Combobox.Target>

        {showControls && (
          <>
            {/* HEX circle — siempre visible */}
            <Popover
                opened={hexPopoverOpen}
                onClose={() => setHexPopoverOpen(false)}
                position="bottom-start"
                withArrow
                closeOnClickOutside
              >
                <Popover.Target>
                  <div
                    onClick={() =>
                      hexSuggestions.length > 0 && setHexPopoverOpen(true)
                    }
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: value?.hexColor || "var(--surface3)",
                      border: "1px solid var(--border2)",
                      cursor: hexSuggestions.length > 0 ? "pointer" : "default",
                      flexShrink: 0,
                    }}
                  />
                </Popover.Target>
                <Popover.Dropdown>
                  <div style={{ display: "flex", gap: 6, padding: 4 }}>
                    {hexSuggestions.map((hex) => (
                      <div
                        key={hex}
                        onClick={() => {
                          if (value) onChange({ ...value, hexColor: hex });
                          setHexPopoverOpen(false);
                        }}
                        title={hex}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: hex,
                          border:
                            value?.hexColor === hex
                              ? "2px solid var(--accent)"
                              : "1px solid rgba(255,255,255,0.2)",
                          cursor: "pointer",
                          transition: "transform 0.1s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.transform = "scale(1.2)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.transform = "scale(1)")
                        }
                      />
                    ))}
                  </div>
                </Popover.Dropdown>
              </Popover>

            {/* Pencil — solo para colores nuevos */}
            {value?.isNew && (
              <Tooltip
                label={
                  !value?.name
                    ? "Escribí un color primero"
                    : "Sugerir colores HEX con IA"
                }
                withArrow
              >
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  disabled={!value?.name || isSuggestingHex}
                  loading={isSuggestingHex}
                  onClick={handleSuggestHex}
                  style={{ opacity: value?.name ? 1 : 0.3, flexShrink: 0 }}
                >
                  <Pencil size={10} />
                </ActionIcon>
              </Tooltip>
            )}
          </>
        )}
      </div>

      <Combobox.Dropdown style={{ minWidth: 220 }}>
        <Combobox.Options mah={200} style={{ overflowY: "auto" }}>
          {filteredColors.map((c) => (
            <Combobox.Option key={c.id} value={String(c.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {c.hexColor && (
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: c.hexColor,
                      border: "1px solid rgba(255,255,255,0.2)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div>
                  <div style={{ fontSize: 13 }}>{c.name}</div>
                  {c.colorBase && (
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>
                      {c.colorBase}
                    </div>
                  )}
                </div>
              </div>
            </Combobox.Option>
          ))}

          {showCreateOption && (
            <>
              {filteredColors.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border)", margin: "2px 0" }} />
              )}
              <Combobox.Option value="__create__">
                <div style={{ color: "#22c55e", fontSize: 13, fontWeight: 600 }}>
                  + Agregar &ldquo;{search.trim()}&rdquo; como nuevo color
                </div>
              </Combobox.Option>
            </>
          )}

          {filteredColors.length === 0 && !showCreateOption && (
            <Combobox.Empty>Sin resultados</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
