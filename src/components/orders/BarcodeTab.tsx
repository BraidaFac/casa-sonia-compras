import {
  ActionIcon,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Sparkles, X } from "lucide-react";
import { generateBarcode, generateReferencia } from "@/lib/barcodes";
import type { Article } from "@/types";

interface Props {
  article: Article;
  onChange: (article: Article) => void;
  readOnly?: boolean;
}

export function BarcodeTab({ article, onChange, readOnly }: Props) {
  // Unique colors in row order (dedup by color name)
  const coloredRows = Array.from(
    new Map(
      article.rows
        .filter((r) => r.color)
        .map((r) => [r.color!.name, r] as [string, typeof r]),
    ).values(),
  );

  function setBarcode(rowId: string, sizeName: string, value: string) {
    onChange({
      ...article,
      rows: article.rows.map((row) =>
        row.id === rowId
          ? { ...row, barcodes: { ...(row.barcodes ?? {}), [sizeName]: value } }
          : row,
      ),
    });
  }

  // Flat ordered list of all [rowId, sizeName] pairs for navigation
  const allPairs: [string, string][] = coloredRows.flatMap((row) =>
    article.sizes.map((size) => [row.id, size.name] as [string, string]),
  );

  function focusNext(rowId: string, sizeName: string) {
    const idx = allPairs.findIndex(([r, s]) => r === rowId && s === sizeName);
    if (idx === -1 || idx >= allPairs.length - 1) return;
    const [nr, ns] = allPairs[idx + 1];
    const el = document
      .querySelector(`[data-bc-row="${nr}"][data-bc-size="${ns}"]`)
      ?.querySelector<HTMLInputElement>("input");
    el?.focus();
    el?.select();
  }

  function autoGenerate() {
    const ref = article.referencia || generateReferencia();

    const newRows = article.rows.map((row) => {
      if (!row.color) return row;
      const newBarcodes: Record<string, string> = { ...(row.barcodes ?? {}) };
      for (const size of article.sizes) {
        // Solo llenar los vacíos
        if (!newBarcodes[size.name]) {
          newBarcodes[size.name] = generateBarcode(
            ref,
            row.color.name,
            size.name,
          );
        }
      }
      return { ...row, barcodes: newBarcodes };
    });

    onChange({ ...article, referencia: ref, rows: newRows });
  }

  if (coloredRows.length === 0 || article.sizes.length === 0) {
    return (
      <Text size="xs" c="dimmed" pt="sm">
        Cargá colores y talles en el tab Cantidades para configurar códigos de
        barra.
      </Text>
    );
  }

  return (
    <Stack gap="md" pt="sm">
      {/* Botón principal */}
      {!readOnly && (
        <Group justify="flex-end">
          <Button
            size="xs"
            variant="light"
            leftSection={<Sparkles size={13} />}
            onClick={autoGenerate}
          >
            Auto generar códigos
          </Button>
        </Group>
      )}

      {/* Grid por color */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="lg">
        {coloredRows.map((row) => (
          <div key={row.color!.name}>
            {/* Section header */}
            <Text
              size="xs"
              tt="uppercase"
              fw={700}
              c="white"
              mb={6}
              style={{ letterSpacing: "0.08em" }}
            >
              {row.color!.name}
            </Text>

            <Stack gap={4}>
              {article.sizes.map((size) => {
                const value = row.barcodes?.[size.name] ?? "";
                return (
                  <Group key={size.name} gap="xs" wrap="nowrap">
                    {/* Talle label */}
                    <Text
                      size="sm"
                      fw={600}
                      c="orange.4"
                      style={{ width: 32, textAlign: "right", flexShrink: 0 }}
                    >
                      {size.name}
                    </Text>

                    {/* Input + botón clear */}
                    <div
                      data-bc-row={row.id}
                      data-bc-size={size.name}
                      style={{ position: "relative", flex: 1 }}
                    >
                      <TextInput
                        size="xs"
                        value={value}
                        onChange={(e) =>
                          setBarcode(row.id, size.name, e.currentTarget.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            focusNext(row.id, size.name);
                          }
                        }}
                        onPaste={() => {
                          setTimeout(() => focusNext(row.id, size.name), 0);
                        }}
                        placeholder="Escanear o ingresar código"
                        readOnly={readOnly}
                        aria-label={`Código de barras ${row.color!.name} ${size.name}`}
                        styles={{
                          input: {
                            fontFamily: "var(--font-mono)",
                            borderColor: value
                              ? "rgba(251,191,36,0.4)"
                              : undefined,
                            paddingRight: value ? 28 : undefined,
                          },
                        }}
                      />
                      {value && !readOnly && (
                        <ActionIcon
                          size="xs"
                          variant="transparent"
                          c="dimmed"
                          tabIndex={-1}
                          style={{
                            position: "absolute",
                            right: 6,
                            top: "50%",
                            transform: "translateY(-50%)",
                            cursor: "pointer",
                          }}
                          onClick={() => setBarcode(row.id, size.name, "")}
                          aria-label={`Limpiar código de ${row.color!.name} ${size.name}`}
                        >
                          <X size={12} />
                        </ActionIcon>
                      )}
                    </div>
                  </Group>
                );
              })}
            </Stack>
          </div>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
