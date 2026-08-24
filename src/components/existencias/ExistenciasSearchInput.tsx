"use client";
import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import { Combobox, TextInput, useCombobox, Loader } from "@mantine/core";
import { ScanBarcode, Search } from "lucide-react";
import type { ArticleSearchResult } from "@/types";

export interface ExistenciasSearchInputHandle {
  focus: () => void;
}

interface ExistenciasSearchInputProps {
  onBarcodeResult: (result: {
    variantId: number;
    templateId: number;
    colorAttributeValueId: number | null;
    sizeAttributeValueId: number | null;
  }) => void;
  onNotFound: (barcode: string) => void;
  onError: (msg: string) => void;
  onSelect: (article: ArticleSearchResult) => void;
}

export const ExistenciasSearchInput = forwardRef<
  ExistenciasSearchInputHandle,
  ExistenciasSearchInputProps
>(function ExistenciasSearchInput({ onBarcodeResult, onNotFound, onError, onSelect }, ref) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArticleSearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingBarcode, setLoadingBarcode] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanIdRef = useRef(0);

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  // Debounced text search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      combobox.closeDropdown();
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const res = await fetch(`/api/existencias/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = (await res.json()) as ArticleSearchResult[];
          setResults(data);
          if (data.length > 0) combobox.openDropdown();
          else combobox.closeDropdown();
        }
      } finally {
        setLoadingSearch(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // Barcode lookup on Enter — always fires when Enter pressed (scanner or manual)
  // Accepts an optional overrideValue for paste-triggered lookups
  const handleEnter = useCallback(async (overrideValue?: string) => {
    const barcode = (overrideValue ?? query).trim();
    if (!barcode) return;

    combobox.closeDropdown();
    setQuery("");
    setResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const scanId = ++scanIdRef.current;
    setLoadingBarcode(true);
    try {
      const res = await fetch(
        `/api/existencias/barcode?barcode=${encodeURIComponent(barcode)}`
      );
      if (scanId !== scanIdRef.current) return;
      if (res.status === 404) {
        onNotFound(barcode);
        return;
      }
      if (!res.ok) {
        onError("Error al consultar código");
        return;
      }
      onBarcodeResult(await res.json());
    } catch {
      if (scanId === scanIdRef.current) onError("Error de conexión");
    } finally {
      if (scanId === scanIdRef.current) {
        setLoadingBarcode(false);
        inputRef.current?.focus();
      }
    }
  }, [query, onBarcodeResult, onNotFound, onError]); // eslint-disable-line react-hooks/exhaustive-deps

  // Paste handler — triggers immediate barcode lookup without waiting for debounce
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").trim();
    if (!pasted) return;
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void handleEnter(pasted);
  }, [handleEnter]);

  function handleSelect(article: ArticleSearchResult) {
    combobox.closeDropdown();
    setQuery("");
    setResults([]);
    onSelect(article);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const loading = loadingSearch || loadingBarcode;
  const hasResults = results.length > 0;

  const leftIcon = loading ? (
    <Loader size={14} />
  ) : hasResults ? (
    <Search size={14} color="var(--mantine-color-amber-5)" />
  ) : (
    <ScanBarcode size={14} color="var(--mantine-color-amber-5)" />
  );

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(val) => {
        const found = results.find((r) => String(r.templateId) === val);
        if (found) handleSelect(found);
      }}
    >
      <Combobox.Target>
        <TextInput
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Escanear código o buscar por nombre..."
          leftSection={leftIcon}
          autoFocus
          disabled={loadingBarcode}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleEnter();
            }
          }}
          onPaste={handlePaste}
          onFocus={() => {
            if (results.length > 0) combobox.openDropdown();
          }}
          onBlur={() => {
            // Delay to allow click on option to register
            setTimeout(() => combobox.closeDropdown(), 150);
          }}
          styles={{
            input: {
              fontFamily: "var(--font-mono)",
              letterSpacing: hasResults ? "normal" : 1,
            },
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options style={{ maxHeight: 320, overflowY: "auto" }}>
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <Combobox.Empty>Sin resultados para &ldquo;{query.trim()}&rdquo;</Combobox.Empty>
          )}
          {results.map((r) => (
            <Combobox.Option key={r.templateId} value={String(r.templateId)}>
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</div>
                {(r.ref || r.defaultCode) && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text3)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {r.ref || r.defaultCode}
                  </div>
                )}
              </div>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
});
