"use client";
import { useState } from "react";
import { Modal, Stack, TextInput, Switch, Button, Group, Text, SimpleGrid, Tooltip, ScrollArea } from "@mantine/core";
import { BANK_ICONS, getBankIcon, BANK_ICON_VIEWBOX, type BankIconEntry } from "@/lib/bankIcons";

export interface BancoRecord {
  id: number;
  nombre: string;
  icono: string | null;
  activo: boolean;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  onSave: (data: { nombre: string; icono: string | null; activo: boolean }) => void;
  item: BancoRecord | null;
  saving: boolean;
  error: string | null;
}

function BankIconPreview({ entry, size = 32 }: { entry: BankIconEntry; size?: number }) {
  const scaledSize = Math.round(size * (entry.scale ?? 1));
  if (entry.svgSrc) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={entry.svgSrc} width={scaledSize} height={scaledSize} alt={entry.nombre} style={{ objectFit: "contain" }} />;
  }
  return (
    <svg
      viewBox={entry.viewBox ?? BANK_ICON_VIEWBOX}
      width={size}
      height={size}
      fill={`#${entry.color}`}
      aria-label={entry.nombre}
    >
      <path d={entry.svgPath} />
    </svg>
  );
}

function BancoModalInner({ opened, onClose, onSave, item, saving, error }: Props) {
  const [nombre, setNombre] = useState(item?.nombre ?? "");
  const [icono, setIcono] = useState<string | null>(item?.icono ?? null);
  const [activo, setActivo] = useState(item?.activo ?? true);

  function handleSubmit() {
    if (!nombre.trim()) return;
    onSave({ nombre: nombre.trim(), icono, activo });
  }

  const selectedEntry = getBankIcon(icono);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={item ? "Editar banco" : "Nuevo banco"}
      size="md"
    >
      <Stack gap="sm">
        <TextInput
          label="Nombre"
          placeholder="Ej. Galicia"
          value={nombre}
          onChange={(e) => setNombre(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          required
          autoFocus
        />

        {/* Icon picker */}
        <div>
          <Text size="sm" fw={500} mb={6}>
            Ícono
            {selectedEntry && (
              <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--text3)" }}>
                — {selectedEntry.nombre} seleccionado
              </span>
            )}
          </Text>
          <ScrollArea h={180} type="auto">
            <SimpleGrid cols={6} spacing={6}>
              {BANK_ICONS.map((entry) => {
                const selected = icono === entry.key;
                return (
                  <Tooltip key={entry.key} label={entry.nombre} withArrow position="top">
                    <button
                      type="button"
                      onClick={() => setIcono(selected ? null : entry.key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        aspectRatio: "1",
                        borderRadius: 8,
                        border: selected
                          ? `2px solid #${entry.color}`
                          : "2px solid var(--border)",
                        background: selected
                          ? `color-mix(in srgb, #${entry.color} 12%, var(--surface))`
                          : "var(--surface)",
                        cursor: "pointer",
                        padding: 6,
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      <BankIconPreview entry={entry} size={26} />
                    </button>
                  </Tooltip>
                );
              })}
            </SimpleGrid>
          </ScrollArea>
          {icono && (
            <Button
              variant="subtle"
              size="xs"
              color="gray"
              mt={4}
              onClick={() => setIcono(null)}
            >
              Quitar ícono
            </Button>
          )}
        </div>

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
          <Button onClick={handleSubmit} loading={saving} disabled={!nombre.trim()}>
            {item ? "Guardar" : "Crear"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Wrapper que remonta el inner al abrir/cambiar item — evita useEffect para resetear form */
export function BancoModal(props: Props) {
  return <BancoModalInner key={props.opened ? String(props.item?.id ?? "new") : "closed"} {...props} />;
}

/** Componente pequeño para mostrar icono de banco en tablas/chips */
export function BancoIcono({ icono, size = 20 }: { icono: string | null | undefined; size?: number }) {
  const entry = getBankIcon(icono);
  if (!entry) return null;
  const scaledSize = Math.round(size * (entry.scale ?? 1));
  if (entry.svgSrc) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={entry.svgSrc} width={scaledSize} height={scaledSize} alt={entry.nombre} style={{ flexShrink: 0, objectFit: "contain" }} />;
  }
  return (
    <svg
      viewBox={entry.viewBox ?? BANK_ICON_VIEWBOX}
      width={size}
      height={size}
      fill={`#${entry.color}`}
      aria-label={entry.nombre}
      style={{ flexShrink: 0 }}
    >
      <path d={entry.svgPath} />
    </svg>
  );
}
