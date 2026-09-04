"use client";
import { useEffect, useState } from "react";
import {
  Modal, Stack, TextInput, Select, MultiSelect, NumberInput, Switch,
  Button, Group, Text, Checkbox, SimpleGrid, Tooltip,
} from "@mantine/core";
import { DateInput } from "@/components/ui/DateInput";
import type { BancoRecord } from "./BancoModal";

export interface PromocionRecord {
  id: number;
  titulo: string;
  bancos: { id: number; nombre: string; icono: string | null }[];
  marcaTarjeta: string | null;
  tipoBeneficio: string;
  cantidadCuotas: number | null;
  coeficienteInteres: string | number | null;
  valorPorcentaje: string | number | null;
  topeReintegro: string | number | null;
  descripcion: string | null;
  diasAplicables: string | null; // JSON string
  vigenciaDesde: string;
  vigenciaHasta: string | null;
  activa: boolean;
  orden: number | null;
}

const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as const;
const DIAS_LABEL: Record<string, string> = {
  lunes: "Lun", martes: "Mar", miercoles: "Mié",
  jueves: "Jue", viernes: "Vie", sabado: "Sáb", domingo: "Dom",
};

const TIPOS_BENEFICIO = [
  { value: "cuotas_sin_interes", label: "Cuotas sin interés" },
  { value: "cuotas_con_interes", label: "Cuotas con interés" },
  { value: "reintegro", label: "Reintegro" },
  { value: "descuento_directo", label: "Descuento directo" },
  { value: "cuotas_con_descuento", label: "Cuotas + descuento en caja" },
  { value: "cuotas_con_reintegro", label: "Cuotas + reintegro" },
];

export type PromocionSaveData = {
  titulo: string;
  bancoIds: number[];
  marcaTarjeta: string | null;
  tipoBeneficio: string;
  cantidadCuotas: number | null;
  coeficienteInteres: number | null;
  valorPorcentaje: number | null;
  topeReintegro: number | null;
  descripcion: string | null;
  diasAplicables: string[] | null;
  vigenciaDesde: string;
  vigenciaHasta: string | null;
  activa: boolean;
  orden: number | null;
};

interface Props {
  opened: boolean;
  onClose: () => void;
  onSave: (data: PromocionSaveData) => void;
  item: PromocionRecord | null;
  bancos: BancoRecord[];
  saving: boolean;
  error: string | null;
}

export function PromocionModal({ opened, onClose, onSave, item, bancos, saving, error }: Props) {
  const [titulo, setTitulo] = useState("");
  const [bancoIds, setBancoIds] = useState<string[]>([]);
  const [marcaTarjeta, setMarcaTarjeta] = useState("");
  const [tipoBeneficio, setTipoBeneficio] = useState("cuotas_sin_interes");
  const [cantidadCuotas, setCantidadCuotas] = useState<number | string>(3);
  const [coeficienteInteres, setCoeficienteInteres] = useState<number | string>(1);
  const [valorPorcentaje, setValorPorcentaje] = useState<number | string>(0);
  const [topeReintegro, setTopeReintegro] = useState<number | string>("");
  const [descripcion, setDescripcion] = useState("");
  const [diasSeleccionados, setDiasSeleccionados] = useState<string[]>([]);
  const [vigenciaDesde, setVigenciaDesde] = useState<Date | null>(null);
  const [vigenciaHasta, setVigenciaHasta] = useState<Date | null>(null);
  const [vigenciaDesdeError, setVigenciaDesdeError] = useState<string | null>(null);
  const [activa, setActiva] = useState(true);
  const [orden, setOrden] = useState<number | string>("");

  useEffect(() => {
    if (opened) {
      setTitulo(item?.titulo ?? "");
      setBancoIds(item ? item.bancos.map((b) => String(b.id)) : []);
      setMarcaTarjeta(item?.marcaTarjeta ?? "");
      setTipoBeneficio(item?.tipoBeneficio ?? "cuotas_sin_interes");
      setCantidadCuotas(item?.cantidadCuotas ?? 3);
      setCoeficienteInteres(item?.coeficienteInteres ? Number(item.coeficienteInteres) : 1);
      setValorPorcentaje(item?.valorPorcentaje ? Number(item.valorPorcentaje) : 0);
      setTopeReintegro(item?.topeReintegro ? Number(item.topeReintegro) : "");
      setDescripcion(item?.descripcion ?? "");
      setDiasSeleccionados(item?.diasAplicables ? JSON.parse(item.diasAplicables) : []);
      setVigenciaDesde(item?.vigenciaDesde ? new Date(item.vigenciaDesde) : null);
      setVigenciaHasta(item?.vigenciaHasta ? new Date(item.vigenciaHasta) : null);
      setVigenciaDesdeError(null);
      setActiva(item?.activa ?? true);
      setOrden(item?.orden ?? "");
    }
  }, [opened, item]);

  function toggleDia(dia: string) {
    setDiasSeleccionados((prev) =>
      prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia],
    );
  }

  function handleSubmit() {
    if (!titulo.trim() || bancoIds.length === 0) return;
    if (!vigenciaDesde) {
      setVigenciaDesdeError("Seleccioná una fecha de inicio válida");
      return;
    }
    setVigenciaDesdeError(null);
    onSave({
      titulo: titulo.trim(),
      bancoIds: bancoIds.map((id) => parseInt(id, 10)),
      marcaTarjeta: marcaTarjeta.trim() || null,
      tipoBeneficio,
      cantidadCuotas: ["cuotas_sin_interes", "cuotas_con_interes", "cuotas_con_descuento", "cuotas_con_reintegro"].includes(tipoBeneficio)
        ? Number(cantidadCuotas) : null,
      coeficienteInteres: tipoBeneficio === "cuotas_con_interes" ? Number(coeficienteInteres) : null,
      valorPorcentaje: ["reintegro", "descuento_directo", "cuotas_con_descuento", "cuotas_con_reintegro"].includes(tipoBeneficio)
        ? Number(valorPorcentaje) : null,
      topeReintegro: ["reintegro", "cuotas_con_descuento", "cuotas_con_reintegro"].includes(tipoBeneficio) && topeReintegro !== "" ? Number(topeReintegro) : null,
      descripcion: descripcion.trim() || null,
      diasAplicables: diasSeleccionados.length > 0 ? diasSeleccionados : null,
      vigenciaDesde: vigenciaDesde.toISOString().split("T")[0],
      vigenciaHasta: vigenciaHasta ? vigenciaHasta.toISOString().split("T")[0] : null,
      activa,
      orden: orden !== "" ? Number(orden) : null,
    });
  }

  const bancosOptions = bancos
    .filter((b) => b.activo || (item?.bancos.some((ib) => ib.id === b.id)))
    .map((b) => ({ value: String(b.id), label: b.nombre }));

  const todosIds = bancosOptions.map((b) => b.value);
  const todosSeleccionados = todosIds.length > 0 && todosIds.every((id) => bancoIds.includes(id));

  const esCuotas = ["cuotas_sin_interes", "cuotas_con_interes"].includes(tipoBeneficio);
  const esReintegroDescuento = ["reintegro", "descuento_directo"].includes(tipoBeneficio);
  const esCuotasConBeneficio = ["cuotas_con_descuento", "cuotas_con_reintegro"].includes(tipoBeneficio);
  const canSubmit = !!titulo.trim() && bancoIds.length > 0 && vigenciaDesde !== null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={item ? "Editar promoción" : "Nueva promoción bancaria"}
      size="lg"
    >
      <Stack gap="sm">
        <Group grow>
          <TextInput
            label="Título"
            placeholder="Ej. 3 cuotas sin interés – Galicia"
            value={titulo}
            onChange={(e) => setTitulo(e.currentTarget.value)}
            required
            autoFocus
          />
          <NumberInput
            label="Orden"
            placeholder="Ej. 1"
            value={orden as number}
            onChange={setOrden}
            min={1}
          />
        </Group>

        <div>
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={500}>Banco <span style={{ color: "var(--mantine-color-red-6)" }}>*</span></Text>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => setBancoIds(todosSeleccionados ? [] : todosIds)}
            >
              {todosSeleccionados ? "Quitar todos" : "Seleccionar todos"}
            </Button>
          </Group>
          <MultiSelect
            placeholder={bancoIds.length === 0 ? "Seleccioná uno o más bancos" : undefined}
            data={bancosOptions}
            value={bancoIds}
            onChange={setBancoIds}
            searchable
            hidePickedOptions={false}
          />
        </div>

        <TextInput
          label="Tarjeta (opcional)"
          placeholder="Ej. Visa, Mastercard, todas"
          value={marcaTarjeta}
          onChange={(e) => setMarcaTarjeta(e.currentTarget.value)}
        />

        <Select
          label="Tipo de beneficio"
          data={TIPOS_BENEFICIO}
          value={tipoBeneficio}
          onChange={(v) => setTipoBeneficio(v ?? "cuotas_sin_interes")}
          required
        />

        {esCuotas && (
          <Group grow>
            <NumberInput
              label="Cantidad de cuotas"
              value={cantidadCuotas as number}
              onChange={setCantidadCuotas}
              min={2}
              max={60}
              required
            />
            {tipoBeneficio === "cuotas_con_interes" && (
              <NumberInput
                label="Coeficiente de interés"
                description="Ej: 1.15 = 15% de interés"
                value={coeficienteInteres as number}
                onChange={setCoeficienteInteres}
                min={1}
                decimalScale={4}
                required
              />
            )}
          </Group>
        )}

        {esReintegroDescuento && (
          <Group grow>
            <NumberInput
              label="Porcentaje (%)"
              value={valorPorcentaje as number}
              onChange={setValorPorcentaje}
              min={0}
              max={100}
              decimalScale={2}
              required
            />
            {tipoBeneficio === "reintegro" && (
              <NumberInput
                label="Tope de reintegro ($)"
                description="Vacío = sin tope"
                value={topeReintegro as number}
                onChange={setTopeReintegro}
                min={0}
              />
            )}
          </Group>
        )}

        {esCuotasConBeneficio && (
          <>
            <Group grow>
              <NumberInput
                label="Cantidad de cuotas"
                value={cantidadCuotas as number}
                onChange={setCantidadCuotas}
                min={2}
                max={60}
                required
              />
              <NumberInput
                label={tipoBeneficio === "cuotas_con_reintegro" ? "Reintegro (%)" : "Descuento (%)"}
                value={valorPorcentaje as number}
                onChange={setValorPorcentaje}
                min={0}
                max={100}
                decimalScale={2}
                required
              />
            </Group>
            <NumberInput
              label={tipoBeneficio === "cuotas_con_reintegro" ? "Tope de reintegro ($)" : "Tope de descuento ($)"}
              description="Vacío = sin tope"
              value={topeReintegro as number}
              onChange={setTopeReintegro}
              min={0}
            />
          </>
        )}

        <div>
          <Text size="sm" fw={500} mb={6}>
            Días aplicables (vacío = todos los días)
          </Text>
          <SimpleGrid cols={7} spacing={6}>
            {DIAS.map((dia) => (
              <Checkbox
                key={dia}
                label={DIAS_LABEL[dia]}
                checked={diasSeleccionados.includes(dia)}
                onChange={() => toggleDia(dia)}
                size="xs"
              />
            ))}
          </SimpleGrid>
        </div>

        <Group grow>
          <DateInput
            label="Vigencia desde"
            value={vigenciaDesde}
            onChange={(d) => { setVigenciaDesde(d); setVigenciaDesdeError(null); }}
            clearable
            required
            error={vigenciaDesdeError}
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

        <TextInput
          label="Condiciones adicionales (opcional)"
          placeholder="Ej. Solo compras mayores a $10.000"
          value={descripcion}
          onChange={(e) => setDescripcion(e.currentTarget.value)}
        />

        {item && (
          <Switch
            label="Activa"
            checked={activa}
            onChange={(e) => setActiva(e.currentTarget.checked)}
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
