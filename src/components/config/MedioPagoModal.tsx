"use client";
import { useEffect, useState } from "react";
import { Modal, Stack, TextInput, Switch, Button, Group, Text } from "@mantine/core";

export interface MedioPagoRecord {
  id: number;
  nombre: string;
  activo: boolean;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  onSave: (data: { nombre: string; activo: boolean }) => void;
  item: MedioPagoRecord | null;
  saving: boolean;
  error: string | null;
}

export function MedioPagoModal({ opened, onClose, onSave, item, saving, error }: Props) {
  const [nombre, setNombre] = useState("");
  const [activo, setActivo] = useState(true);

  useEffect(() => {
    if (opened) {
      setNombre(item?.nombre ?? "");
      setActivo(item?.activo ?? true);
    }
  }, [opened, item]);

  function handleSubmit() {
    if (!nombre.trim()) return;
    onSave({ nombre: nombre.trim(), activo });
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={item ? "Editar medio de pago" : "Nuevo medio de pago"}
      size="sm"
    >
      <Stack gap="sm">
        <TextInput
          label="Nombre"
          placeholder="Ej. Efectivo"
          value={nombre}
          onChange={(e) => setNombre(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          required
          autoFocus
        />
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
