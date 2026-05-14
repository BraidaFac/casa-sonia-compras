"use client";
import { useState, useMemo } from "react";
import {
  Modal,
  SegmentedControl,
  NumberInput,
  Select,
  Stack,
  Group,
  Button,
  Text,
  SimpleGrid,
  Badge,
} from "@mantine/core";
import {
  LETTER_SIZES,
  getLetterSizeRange,
  getNumericSizeRange,
  type LetterSize,
} from "@/lib/sizes";
import type { AttributeValue } from "@/types";

interface Props {
  opened: boolean;
  onClose: () => void;
  onConfirm: (sizes: AttributeValue[]) => void;
  availableSizes: AttributeValue[];
}

function matchSize(
  generated: string,
  available: AttributeValue[],
): AttributeValue | null {
  return (
    available.find((a) => a.name.toLowerCase() === generated.toLowerCase()) ??
    null
  );
}

export function SizeRangeModal({
  opened,
  onClose,
  onConfirm,
  availableSizes,
}: Props) {
  const [mode, setMode] = useState<"numeric" | "letter">("numeric");

  // Numeric
  const [numFrom, setNumFrom] = useState<number | string>(30);
  const [numTo, setNumTo] = useState<number | string>(50);
  const [numStep, setNumStep] = useState<number | string>(2);

  // Letter
  const [letterFrom, setLetterFrom] = useState<LetterSize | null>("S");
  const [letterTo, setLetterTo] = useState<LetterSize | null>("XL");

  const generatedNames: string[] = useMemo(() => {
    if (mode === "numeric") {
      const from = Number(numFrom);
      const to = Number(numTo);
      const step = Number(numStep);
      if (!from || !to || !step || step < 1 || from > to) return [];
      return getNumericSizeRange(from, to, step);
    } else {
      if (!letterFrom || !letterTo) return [];
      return getLetterSizeRange(letterFrom, letterTo);
    }
  }, [mode, numFrom, numTo, numStep, letterFrom, letterTo]);

  const preview = useMemo(
    () =>
      generatedNames.map((name) => ({
        name,
        match: matchSize(name, availableSizes),
      })),
    [generatedNames, availableSizes],
  );

  const validSizes = preview
    .filter((p) => p.match !== null)
    .map((p) => p.match!);
  const notFoundCount = preview.filter((p) => p.match === null).length;

  const letterFromOptions = LETTER_SIZES.map((s) => ({ value: s, label: s }));
  const letterToOptions = LETTER_SIZES.filter((s) => {
    if (!letterFrom) return true;
    return LETTER_SIZES.indexOf(s) >= LETTER_SIZES.indexOf(letterFrom);
  }).map((s) => ({ value: s, label: s }));

  function handleConfirm() {
    if (validSizes.length === 0) return;
    onConfirm(validSizes);
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Agregar talles por rango"
      centered
      size="md"
    >
      <Stack gap="md">
        <SegmentedControl
          value={mode}
          onChange={(v) => setMode(v as "numeric" | "letter")}
          data={[
            { label: "Numérico", value: "numeric" },
            { label: "Letras", value: "letter" },
          ]}
          fullWidth
        />

        {mode === "numeric" ? (
          <Group grow>
            <NumberInput
              label="Desde"
              value={numFrom}
              onChange={setNumFrom}
              min={0}
              hideControls
            />
            <NumberInput
              label="Hasta"
              value={numTo}
              onChange={setNumTo}
              min={0}
              hideControls
            />
            <NumberInput
              label="Variación"
              value={numStep}
              onChange={setNumStep}
              min={1}
              hideControls
            />
          </Group>
        ) : (
          <Group grow>
            <Select
              label="Desde"
              value={letterFrom}
              onChange={(v) => {
                setLetterFrom(v as LetterSize);
                // Reset "to" if now < from
                if (
                  v &&
                  letterTo &&
                  LETTER_SIZES.indexOf(v as LetterSize) >
                    LETTER_SIZES.indexOf(letterTo)
                ) {
                  setLetterTo(v as LetterSize);
                }
              }}
              data={letterFromOptions}
              allowDeselect={false}
            />
            <Select
              label="Hasta"
              value={letterTo}
              onChange={(v) => setLetterTo(v as LetterSize)}
              data={letterToOptions}
              allowDeselect={false}
            />
          </Group>
        )}

        {preview.length > 0 && (
          <Stack gap="xs">
            <Text size="sm" c="dimmed" fw={500}>
              Preview:
            </Text>
            <SimpleGrid cols={6} spacing="xs">
              {preview.map(({ name, match }) => (
                <Badge
                  key={name}
                  color={match ? "green" : "red"}
                  variant="light"
                  size="sm"
                  title={
                    match
                      ? `Existe en Odoo: ${match.name}`
                      : "No existe en Odoo"
                  }
                >
                  {match ? "✓" : "✗"} {name}
                </Badge>
              ))}
            </SimpleGrid>

            {notFoundCount > 0 && (
              <Text size="xs" c="red">
                {notFoundCount} talle{notFoundCount > 1 ? "s" : ""} no existe
                {notFoundCount === 1 ? "" : "n"} en Odoo y no se agregarán.
              </Text>
            )}

            {validSizes.length === 0 && (
              <Text size="xs" c="orange">
                Ningún talle del rango existe en Odoo.
              </Text>
            )}
          </Stack>
        )}

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            color="amber"
            onClick={handleConfirm}
            disabled={validSizes.length === 0}
          >
            Agregar talles ({validSizes.length})
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
