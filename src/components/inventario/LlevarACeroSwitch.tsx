"use client";
import { Paper, Switch, Text, Stack, Group, Badge } from "@mantine/core";
import { AlertTriangle } from "lucide-react";

export interface ImpactoLlevarACero {
  ruta: string;
  variantes: number;
  unidades: number;
}

interface Props {
  /** null = conteo confirmado antes de que se registrara la opción. */
  value: boolean | null;
  onChange?: (v: boolean) => void;
  readOnly?: boolean;
  /** Solo se muestra si value es true y no es readOnly. */
  impacto?: ImpactoLlevarACero[];
}

const EXPLICACION =
  "Pone en 0 en Odoo todo producto de cada categoría con algún artículo cargado que NO esté en este conteo. " +
  "Si el conteo de una categoría está repartido en varios inventarios, borra lo que contaron los otros.";

/** Opción "Llevar a cero no contados": bloque destacado, editable (alta/resumen) o de solo lectura (confirmado). */
export function LlevarACeroSwitch({ value, onChange, readOnly = false, impacto }: Props) {
  if (readOnly) {
    const label = value === null ? "Sin registro" : value ? "Sí" : "No";
    const color = value === null ? "gray" : value ? "orange" : "green";
    return (
      <Group gap="xs">
        <Text size="sm" c="dimmed">
          Se confirmó llevando a cero los no contados:
        </Text>
        <Badge color={color} variant="light">
          {label}
        </Badge>
      </Group>
    );
  }

  const activo = value === true;
  const totalVariantes = impacto?.reduce((s, i) => s + i.variantes, 0) ?? 0;
  const totalUnidades = impacto?.reduce((s, i) => s + i.unidades, 0) ?? 0;

  return (
    <Paper withBorder p="sm" radius="md" bg={activo ? "var(--mantine-color-orange-light)" : undefined}>
      <Stack gap={6}>
        <Switch
          size="md"
          color="orange"
          checked={activo}
          onChange={(e) => onChange?.(e.currentTarget.checked)}
          label={
            <Text fw={600} size="sm">
              Llevar a cero no contados
            </Text>
          }
        />
        <Text size="xs" c="dimmed">
          {EXPLICACION}
        </Text>
        {activo && impacto && (
          <Stack gap={2} mt={4}>
            {impacto.length === 0 ? (
              <Text size="xs" c="dimmed">
                No hay variantes no contadas con stock: no se pone nada en 0.
              </Text>
            ) : (
              <>
                <Group gap={6}>
                  <AlertTriangle size={14} color="var(--mantine-color-orange-5)" />
                  <Text size="xs" fw={600} c="orange.4">
                    Se van a poner en 0 {totalVariantes} variantes ({totalUnidades} unidades):
                  </Text>
                </Group>
                {impacto.map((i) => (
                  <Text key={i.ruta} size="xs" c="dimmed" pl="lg">
                    · {i.ruta}: {i.variantes} variantes / {i.unidades} unidades
                  </Text>
                ))}
              </>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
