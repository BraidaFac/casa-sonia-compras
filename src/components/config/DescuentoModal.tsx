"use client";
import { useEffect, useState } from "react";
import { Modal, Stack, TextInput, Select, NumberInput, Switch, Button, Group, Text, Tooltip } from "@mantine/core";
import { DateInput } from "@/components/ui/DateInput";
import type { MedioPagoRecord } from "./MedioPagoModal";
import type { ProductCategory } from "@/app/api/categories/route";

export interface DescuentoRecord {
  id: number;
  nombre: string | null;
  medioPagoId: number;
  medioPago: { id: number; nombre: string };
  tipo: string;
  valor: string | number;
  alcance: string;
  categoriaOdooId: number | null;
  activo: boolean;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  onSave: (data: Partial<DescuentoRecord>) => void;
  item: DescuentoRecord | null;
  mediosPago: MedioPagoRecord[];
  categorias: ProductCategory[];
  saving: boolean;
  error: string | null;
}

export function DescuentoModal({ opened, onClose, onSave, item, mediosPago, categorias, saving, error }: Props) {
  const [nombre, setNombre] = useState("");
  const [medioPagoId, setMedioPagoId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<string>("porcentaje");
  const [valor, setValor] = useState<number | string>(0);
  const [alcance, setAlcance] = useState<string>("global");
  const [categoriaOdooId, setCategoriaOdooId] = useState<string | null>(null);
  const [activo, setActivo] = useState(true);
  const [vigenciaDesde, setVigenciaDesde] = useState<Date | null>(null);
  const [vigenciaHasta, setVigenciaHasta] = useState<Date | null>(null);

  useEffect(() => {
    if (opened) {
      setNombre(item?.nombre ?? "");
      setMedioPagoId(item ? String(item.medioPagoId) : null);
      setTipo(item?.tipo ?? "porcentaje");
      setValor(item ? Number(item.valor) : 0);
      setAlcance(item?.alcance ?? "global");
      setCategoriaOdooId(item?.categoriaOdooId ? String(item.categoriaOdooId) : null);
      setActivo(item?.activo ?? true);
      setVigenciaDesde(item?.vigenciaDesde ? new Date(item.vigenciaDesde) : null);
      setVigenciaHasta(item?.vigenciaHasta ? new Date(item.vigenciaHasta) : null);
    }
  }, [opened, item]);

  function handleSubmit() {
    if (!medioPagoId || valor === "" || valor === undefined) return;
    onSave({
      nombre: nombre.trim() || undefined,
      medioPagoId: parseInt(medioPagoId, 10),
      tipo,
      valor,
      alcance,
      categoriaOdooId: alcance === "categoria" && categoriaOdooId ? parseInt(categoriaOdooId, 10) : null,
      activo,
      vigenciaDesde: vigenciaDesde instanceof Date ? vigenciaDesde.toISOString().split("T")[0] : (vigenciaDesde ? String(vigenciaDesde).split("T")[0] : null),
      vigenciaHasta: vigenciaHasta instanceof Date ? vigenciaHasta.toISOString().split("T")[0] : (vigenciaHasta ? String(vigenciaHasta).split("T")[0] : null),
    });
  }

  const mediosOptions = mediosPago
    .filter((m) => m.activo || (item && item.medioPagoId === m.id))
    .map((m) => ({ value: String(m.id), label: m.nombre }));

  const categoriasOptions = categorias.map((c) => ({
    value: String(c.id),
    label: c.completeName,
  }));

  const canSubmit = !!medioPagoId && valor !== "" && valor !== undefined &&
    (alcance === "global" || !!categoriaOdooId);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={item ? "Editar descuento" : "Nuevo descuento especial"}
      size="md"
    >
      <Stack gap="sm">
        <TextInput
          label="Nombre (opcional)"
          placeholder="Ej. Descuento efectivo"
          value={nombre}
          onChange={(e) => setNombre(e.currentTarget.value)}
        />
        <Select
          label="Medio de pago"
          placeholder="Seleccioná un medio"
          data={mediosOptions}
          value={medioPagoId}
          onChange={setMedioPagoId}
          required
          searchable
        />
        <Group grow>
          <Select
            label="Tipo"
            data={[
              { value: "porcentaje", label: "Porcentaje (%)" },
              { value: "monto_fijo", label: "Monto fijo ($)" },
            ]}
            value={tipo}
            onChange={(v) => setTipo(v ?? "porcentaje")}
            required
          />
          <NumberInput
            label={tipo === "porcentaje" ? "Valor (%)" : "Valor ($)"}
            value={valor as number}
            onChange={setValor}
            min={0}
            max={tipo === "porcentaje" ? 100 : undefined}
            decimalScale={2}
            required
          />
        </Group>
        <Select
          label="Alcance"
          data={[
            { value: "global", label: "Global (todos los productos)" },
            { value: "categoria", label: "Por categoría" },
          ]}
          value={alcance}
          onChange={(v) => { setAlcance(v ?? "global"); setCategoriaOdooId(null); }}
          required
        />
        {alcance === "categoria" && (
          <Select
            label="Categoría"
            placeholder="Seleccioná una categoría"
            data={categoriasOptions}
            value={categoriaOdooId}
            onChange={setCategoriaOdooId}
            required
            searchable
          />
        )}
        <Group grow>
          <DateInput
            label="Vigencia desde"
            value={vigenciaDesde}
            onChange={setVigenciaDesde}
            clearable
          />
          <DateInput
            label={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                Vigencia hasta
                <Tooltip label="Vacío = sin fecha de fin" withArrow position="top">
                  <span style={{ cursor: "help", color: "var(--mantine-color-dimmed)", fontSize: 11, lineHeight: 1 }}>ⓘ</span>
                </Tooltip>
              </span>
            }
            value={vigenciaHasta}
            onChange={setVigenciaHasta}
            clearable
          />
        </Group>
        {item && (
          <Switch
            label="Activo"
            checked={activo}
            onChange={(e) => setActivo(e.currentTarget.checked)}
          />
        )}
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        <Group justify="flex-end" mt="xs">
          <Button variant="subtle" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!canSubmit}>
            {item ? "Guardar" : "Crear"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
