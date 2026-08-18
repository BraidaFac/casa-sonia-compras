"use client";
import { useState, useRef, useEffect } from "react";
import { Combobox, TextInput, useCombobox, Loader } from "@mantine/core";
import { Search } from "lucide-react";
import type { ArticleSearchResult } from "@/types";

interface ArticleSearchInputProps {
  onSelect: (article: ArticleSearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function ArticleSearchInput({
  onSelect,
  placeholder = "Buscar artículo...",
  autoFocus,
  disabled,
}: ArticleSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArticleSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]); // clear immediately when query is too short
      combobox.closeDropdown();
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/existencias/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = (await res.json()) as ArticleSearchResult[];
          setResults(data);
          if (data.length > 0) combobox.openDropdown();
          else combobox.closeDropdown();
        }
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]); // eslint-disable-line

  function handleSelect(article: ArticleSearchResult) {
    combobox.closeDropdown();
    setQuery("");
    setResults([]);
    onSelect(article);
  }

  const noResults = !loading && query.trim().length >= 2 && results.length === 0;

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
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          leftSection={loading ? <Loader size={14} /> : <Search size={14} />}
          onFocus={() => {
            if (results.length > 0) combobox.openDropdown();
          }}
          onBlur={() => combobox.closeDropdown()}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {noResults && <Combobox.Empty>Sin resultados</Combobox.Empty>}
          {results.map((r) => (
            <Combobox.Option key={r.templateId} value={String(r.templateId)}>
              <div>
                <div style={{ fontWeight: 500 }}>{r.name}</div>
                {(r.ref || r.defaultCode) && (
                  <div style={{ fontSize: 12, color: "var(--text3)" }}>
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
}
