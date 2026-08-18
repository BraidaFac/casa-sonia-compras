"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Badge, Tooltip, Text, Group } from "@mantine/core";
import { Plus, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { EmployeeModal } from "@/components/empleados/EmployeeModal";
import type { EmployeeFormData, EmployeeRecord } from "@/components/empleados/EmployeeModal";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EMPLEADO: "Encargado",
  EMPLEADO_BASICO: "Empleado",
};

const ROLE_COLOR: Record<string, string> = {
  ADMIN: "red",
  MANAGER: "blue",
  EMPLEADO: "gray",
  EMPLEADO_BASICO: "dark",
};

async function fetchEmployees(): Promise<EmployeeRecord[]> {
  const res = await fetch("/api/employees");
  if (!res.ok) throw new Error("Error al cargar empleados");
  return res.json();
}

export default function EmpleadosPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: currentEmployee, isLoading: loadingMe } = useCurrentEmployee();

  useEffect(() => {
    if (!loadingMe && (currentEmployee?.role === "EMPLEADO" || currentEmployee?.role === "EMPLEADO_BASICO")) {
      router.replace("/orders");
    }
  }, [currentEmployee, loadingMe, router]);

  const { data: employees = [], isLoading } = useQuery<EmployeeRecord[]>({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
    enabled: !!currentEmployee && currentEmployee.role !== "EMPLEADO" && currentEmployee.role !== "EMPLEADO_BASICO",
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeRecord | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (data: EmployeeFormData & { id?: number }) => {
      const { id, ...body } = data;
      const url = id ? `/api/employees/${id}` : "/api/employees";
      const method = id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Error al guardar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setModalOpen(false);
      setEditTarget(null);
      setModalError(null);
    },
    onError: (e: Error) => {
      setModalError(e.message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/employees/${id}/toggle`, { method: "PATCH" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Error");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  function openCreate() {
    setEditTarget(null);
    setModalError(null);
    setModalOpen(true);
  }

  function openEdit(emp: EmployeeRecord) {
    setEditTarget(emp);
    setModalError(null);
    setModalOpen(true);
  }

  async function handleSave(data: EmployeeFormData) {
    saveMutation.mutate({ ...data, id: editTarget?.id });
  }

  function canActOn(emp: EmployeeRecord): boolean {
    if (!currentEmployee) return false;
    if (currentEmployee.role === "ADMIN") return true;
    return emp.role !== "ADMIN";
  }

  if (loadingMe || isLoading) {
    return (
      <div style={{ padding: 32, color: "var(--text2)", fontFamily: "var(--font-sans)" }}>
        Cargando...
      </div>
    );
  }

  if (!currentEmployee || currentEmployee.role === "EMPLEADO" || currentEmployee.role === "EMPLEADO_BASICO") return null;

  return (
    <div style={{ padding: "32px 40px" }}>
      <Group justify="space-between" mb={24} align="center">
        <Text
          style={{
            fontSize: 22,
            fontWeight: 700,
            fontFamily: "var(--font-display)",
            color: "var(--text1)",
          }}
        >
          Empleados
        </Text>
        <Button leftSection={<Plus size={16} />} onClick={openCreate}>
          Nuevo empleado
        </Button>
      </Group>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--border)",
                background: "var(--surface2, rgba(255,255,255,0.03))",
              }}
            >
              {["Nombre", "Username", "Rol", "Estado", "Acciones"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 16px",
                    textAlign: "left",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text3)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const canAct = canActOn(emp);
              return (
                <tr
                  key={emp.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    opacity: emp.active ? 1 : 0.5,
                  }}
                >
                  <td
                    style={{
                      padding: "12px 16px",
                      fontSize: 14,
                      color: "var(--text1)",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {emp.name}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      fontSize: 13,
                      color: "var(--text2)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {emp.username}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Badge color={ROLE_COLOR[emp.role] ?? "gray"} variant="light" size="sm">
                      {ROLE_LABEL[emp.role] ?? emp.role}
                    </Badge>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Badge color={emp.active ? "green" : "gray"} variant="dot" size="sm">
                      {emp.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Group gap={8}>
                      <Tooltip
                        label={canAct ? "Editar" : "Sin permisos"}
                        withArrow
                        position="top"
                      >
                        <button
                          onClick={() => canAct && openEdit(emp)}
                          disabled={!canAct}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: canAct ? "pointer" : "not-allowed",
                            color: canAct ? "var(--text2)" : "var(--text3)",
                            padding: 4,
                            borderRadius: 4,
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip
                        label={
                          !canAct
                            ? "Sin permisos"
                            : emp.id === currentEmployee.employeeId
                              ? "No podés desactivar tu propia cuenta"
                              : emp.active
                                ? "Desactivar"
                                : "Activar"
                        }
                        withArrow
                        position="top"
                      >
                        <button
                          onClick={() =>
                            canAct &&
                            emp.id !== currentEmployee.employeeId &&
                            toggleMutation.mutate(emp.id)
                          }
                          disabled={!canAct || emp.id === currentEmployee.employeeId}
                          style={{
                            background: "none",
                            border: "none",
                            cursor:
                              canAct && emp.id !== currentEmployee.employeeId
                                ? "pointer"
                                : "not-allowed",
                            color:
                              canAct && emp.id !== currentEmployee.employeeId
                                ? "var(--text2)"
                                : "var(--text3)",
                            padding: 4,
                            borderRadius: 4,
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {emp.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                      </Tooltip>
                    </Group>
                  </td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: "32px 16px",
                    textAlign: "center",
                    color: "var(--text3)",
                    fontSize: 13,
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  No hay empleados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EmployeeModal
        opened={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditTarget(null);
          setModalError(null);
        }}
        onSave={handleSave}
        employee={editTarget}
        currentEmployee={currentEmployee}
        saving={saveMutation.isPending}
        error={modalError}
      />
    </div>
  );
}
