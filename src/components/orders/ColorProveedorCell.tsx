"use client";
import { useState, useEffect, useRef } from "react";
import {
  Combobox,
  useCombobox,
  ActionIcon,
  Popover,
  Tooltip,
  ColorPicker,
  Button,
} from "@mantine/core";
import { Pencil, Check } from "lucide-react";
import type { ColorValue } from "@/types";

interface Props {
  value: ColorValue | null;
  allColors: ColorValue[];
  colorBaseOptions: string[];
  onChange: (color: ColorValue | null) => void;
  hasQty: boolean;
  usedColorKeys?: Set<string>; // keys of colors already used in other rows
}

export function ColorProveedorCell({
  value,
  allColors,
  onChange,
  hasQty,
  usedColorKeys,
}: Props) {
  const [search, setSearch] = useState(value?.name || "");
  const [isSuggestingHex, setIsSuggestingHex] = useState(false);
  const [hexSuggestions, setHexSuggestions] = useState<string[]>([]);
  const [hexPopoverOpen, setHexPopoverOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value?.hexColor || "");
  const dropdownOpenRef = useRef(false);
  const hexTriggerRef = useRef<HTMLDivElement>(null);
  const hexDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hexPopoverOpen) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        hexDropdownRef.current?.contains(target) ||
        hexTriggerRef.current?.contains(target)
      ) return;
      setHexPopoverOpen(false);
    }
    // Delay para no capturar el click que abrió el popover
    const t = setTimeout(() => document.addEventListener("mousedown", onMouseDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [hexPopoverOpen]);

  const combobox = useCombobox({
    onDropdownOpen: () => { dropdownOpenRef.current = true; },
    onDropdownClose: () => {
      dropdownOpenRef.current = false;
      combobox.resetSelectedOption();
    },
  });

  // Sync hexInput from outside only when popover is closed (avoids loop while picker is active)
  useEffect(() => {
    if (!hexPopoverOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHexInput(value?.hexColor || ""); // intentional sync from controlled prop
    }
  }, [value?.hexColor, hexPopoverOpen]);

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

  const filteredColors = allColors.filter((c) => {
    if (!c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (usedColorKeys) {
      const key = c.id != null ? String(c.id) : c.name.toLowerCase();
      if (usedColorKeys.has(key)) return false;
    }
    return true;
  });

  const isExactMatch = allColors.some(
    (c) => c.name.toLowerCase() === search.toLowerCase(),
  );
  const showCreateOption = search.trim() !== "" && !isExactMatch;

  // When value is null but user typed a new color name, derive a temporary value
  // so the hex picker can work without requiring explicit "Agregar" click first
  const effectiveValue: ColorValue | null = value ?? (
    search.trim() && showCreateOption
      ? {
          id: null,
          name: search.trim().replace(/\b\w/g, (c) => c.toUpperCase()),
          colorBase: "",
          hexColor: hexInput,
          isNew: true,
        }
      : null
  );

  async function handleSuggestHex() {
    if (!effectiveValue?.name) return;
    setIsSuggestingHex(true);
    try {
      const res = await fetch("/api/suggest-hex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colorName: effectiveValue.name }),
      });
      if (!res.ok) throw new Error("Error sugiriendo HEX");
      const { hexColors } = await res.json();
      setHexSuggestions(hexColors);
      if (hexColors.length > 0 && !effectiveValue.hexColor) {
        onChange({ ...effectiveValue, hexColor: hexColors[0] });
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
          const name = trimmed.length > 0 ? trimmed.replace(/\b\w/g, (c) => c.toUpperCase()) : trimmed;
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
              const capitalized = raw.replace(/\b\w/g, (c) => c.toUpperCase());
              setSearch(capitalized);
              if (value && capitalized !== value.name) {
                onChange(null);
              }
              combobox.openDropdown();
            }}
            onFocus={() => combobox.openDropdown()}
            onKeyDown={(e) => {
              if (!combobox.dropdownOpened) return;
              if (e.key === "Tab" && (filteredColors.length > 0 || showCreateOption)) {
                e.preventDefault();
                combobox.selectNextOption();
              } else if (e.key === "Enter" && filteredColors.length === 1) {
                e.preventDefault();
                const selected = filteredColors[0];
                onChange(selected);
                setSearch(selected.name);
                prevValueNameRef.current = selected.name;
                combobox.closeDropdown();
              } else if (e.key === "Enter" && filteredColors.length === 0 && showCreateOption) {
                e.preventDefault();
                const trimmed = search.trim();
                const name = trimmed.length > 0 ? trimmed.replace(/\b\w/g, (c) => c.toUpperCase()) : trimmed;
                onChange({ id: null, name, colorBase: "", hexColor: "", isNew: true });
                combobox.closeDropdown();
              }
            }}
            onBlur={() => {
              combobox.closeDropdown();
              if (!value) {
                // Don't clear if user typed a new color — keep the search text
                if (!showCreateOption) setSearch("");
              } else {
                setSearch(value.name);
              }
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
            {/* HEX circle — abre popover de edición de color */}
            <Popover
                opened={hexPopoverOpen}
                onClose={() => setHexPopoverOpen(false)}
                position="bottom-start"
                withArrow
                withinPortal
              >
                <Popover.Target>
                  <div
                    ref={hexTriggerRef}
                    onMouseDown={(e) => e.preventDefault()} // evita blur en el input de texto
                    onClick={() => {
                      if (!effectiveValue) return;
                      // Si el color aún no existe como value (sólo search), lo creamos antes de abrir
                      if (!value && effectiveValue) {
                        onChange(effectiveValue);
                      }
                      combobox.closeDropdown();
                      setHexPopoverOpen(true);
                    }}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: effectiveValue?.hexColor || "var(--surface3)",
                      border: "1px solid var(--border2)",
                      cursor: effectiveValue ? "pointer" : "default",
                      flexShrink: 0,
                    }}
                  />
                </Popover.Target>
                <Popover.Dropdown>
                  <div ref={hexDropdownRef} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 4 }}>
                    {/* Mantine ColorPicker — fluido, sin lag del OS */}
                    <ColorPicker
                      format="hex"
                      value={/^#[0-9a-fA-F]{6}$/.test(hexInput) ? hexInput : "#ffffff"}
                      onChange={(hex) => {
                        setHexInput(hex);
                        if (effectiveValue) onChange({ ...effectiveValue, hexColor: hex });
                      }}
                      size="xs"
                    />

                    {/* Input HEX manual */}
                    <input
                      type="text"
                      value={hexInput}
                      placeholder="#RRGGBB"
                      maxLength={7}
                      onChange={(e) => {
                        const v = e.target.value;
                        setHexInput(v);
                        if (/^#[0-9a-fA-F]{6}$/.test(v) && effectiveValue) {
                          onChange({ ...effectiveValue, hexColor: v });
                        }
                      }}
                      onKeyDown={(e) => e.key === "Escape" && setHexPopoverOpen(false)}
                      style={{
                        width: "100%",
                        fontSize: 12,
                        fontFamily: "monospace",
                        border: "1px solid var(--border2)",
                        borderRadius: 4,
                        padding: "3px 6px",
                        background: "var(--surface2)",
                        color: "var(--text)",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />

                    {/* Sugerencias IA (si existen) */}
                    {hexSuggestions.length > 0 && (
                      <>
                        <div style={{ fontSize: 11, color: "var(--text3)" }}>Sugerencias IA</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {hexSuggestions.map((hex) => (
                            <div
                              key={hex}
                              onClick={() => {
                                setHexInput(hex);
                                if (effectiveValue) onChange({ ...effectiveValue, hexColor: hex });
                                setHexPopoverOpen(false);
                              }}
                              title={hex}
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                                background: hex,
                                border:
                                  (value?.hexColor ?? hexInput) === hex
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
                      </>
                    )}

                    {/* Botón Listo */}
                    <Button
                      size="xs"
                      variant="subtle"
                      color="gray"
                      leftSection={<Check size={12} />}
                      onClick={() => setHexPopoverOpen(false)}
                      fullWidth
                    >
                      Listo
                    </Button>
                  </div>
                </Popover.Dropdown>
              </Popover>

            {/* Pencil — solo para colores nuevos */}
            {(value?.isNew || (showCreateOption && !value)) && (
              <Tooltip
                label={
                  !effectiveValue?.name
                    ? "Escribí un color primero"
                    : "Sugerir colores HEX con IA"
                }
                withArrow
              >
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  disabled={!effectiveValue?.name || isSuggestingHex}
                  loading={isSuggestingHex}
                  onClick={handleSuggestHex}
                  style={{ opacity: effectiveValue?.name ? 1 : 0.3, flexShrink: 0 }}
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
