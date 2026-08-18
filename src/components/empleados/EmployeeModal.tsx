"use client";
import { useEffect, useState } from "react";
import { Modal, TextInput, PasswordInput, Select, Button, Group, Stack } from "@mantine/core";
import type { CurrentEmployee } from "@/hooks/useCurrentEmployee";

export type EmployeeFormData = {
  username: string;
  name: string;
  role: string;
  password: string;
};

export type EmployeeRecord = {
  id: number;
  username: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
};

interface Props {
  opened: boolean;
  onClose: () => void;
  onSave: (data: EmployeeFormData) => Promise<void>;
  employee: EmployeeRecord | null;
  currentEmployee: CurrentEmployee;
  saving: boolean;
  error: string | null;
}

export function EmployeeModal({
  opened,
  onClose,
  onSave,
  employee,
  currentEmployee,
  saving,
  error,
}: Props) {
  const isEdit = employee !== null;

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("EMPLEADO_BASICO");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (opened) {
      // Reset form fields when modal opens — intentional sync from props
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUsername(employee?.username ?? "");
       
      setName(employee?.name ?? "");
       
      setRole(employee?.role ?? "EMPLEADO_BASICO");
       
      setPassword("");
    }
  }, [opened, employee]);

  const roleOptions =
    currentEmployee.role === "ADMIN"
      ? [
          { value: "EMPLEADO_BASICO", label: "Empleado" },
          { value: "EMPLEADO", label: "Encargado" },
          { value: "MANAGER", label: "Manager" },
          { value: "ADMIN", label: "Admin" },
        ]
      : [
          { value: "EMPLEADO_BASICO", label: "Empleado" },
          { value: "EMPLEADO", label: "Encargado" },
          { value: "MANAGER", label: "Manager" },
        ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSave({ username, name, role, password });
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? "Editar empleado" : "Nuevo empleado"}
      centered
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          <TextInput
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            autoFocus
          />
          <TextInput
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            required
          />
          <Select
            label="Rol"
            value={role}
            onChange={(v) => setRole(v ?? "EMPLEADO_BASICO")}
            data={roleOptions}
            required
          />
          <PasswordInput
            label={isEdit ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required={!isEdit}
          />
          {error && (
            <div style={{ color: "var(--mantine-color-red-4)", fontSize: 13 }}>{error}</div>
          )}
          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
