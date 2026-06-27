"use client";
import { Modal, Stack, Text, Button, Code, Alert } from "@mantine/core";
import { AlertCircle } from "lucide-react";

interface ParsedError {
  message?: string;
  step?: string;
  partialOdooId?: number | string;
}

interface ErrorDetailModalProps {
  opened: boolean;
  onClose: () => void;
  errorDetail: string;
}

function parseErrorDetail(raw: string): { parsed: ParsedError | null; raw: string } {
  try {
    const obj = JSON.parse(raw) as ParsedError;
    return { parsed: obj, raw };
  } catch {
    return { parsed: null, raw };
  }
}

export function ErrorDetailModal({
  opened,
  onClose,
  errorDetail,
}: ErrorDetailModalProps) {
  const { parsed, raw } = parseErrorDetail(errorDetail || "");

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={600} c="red">
          Error al confirmar
        </Text>
      }
      centered
      size="md"
    >
      <Stack gap="md">
        <Alert icon={<AlertCircle size={16} />} color="red" variant="light">
          <Text size="sm">
            Esta orden falló al intentar enviarse a Odoo.
          </Text>
        </Alert>

        {parsed ? (
          <Stack gap="xs">
            {parsed.message && (
              <div>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
                  Mensaje
                </Text>
                <Text size="sm">{parsed.message}</Text>
              </div>
            )}
            {parsed.step && (
              <div>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
                  Paso donde falló
                </Text>
                <Text size="sm">{parsed.step}</Text>
              </div>
            )}
            {parsed.partialOdooId != null && (
              <div>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
                  ID parcial en Odoo
                </Text>
                <Code>{String(parsed.partialOdooId)}</Code>
              </div>
            )}
            <div>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
                Detalle completo
              </Text>
              <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12 }}>
                {raw || "Sin detalle disponible"}
              </Code>
            </div>
          </Stack>
        ) : (
          <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12 }}>
            {raw || "Sin detalle disponible"}
          </Code>
        )}

        <Button color="amber" onClick={onClose}>
          Cerrar
        </Button>
      </Stack>
    </Modal>
  );
}
