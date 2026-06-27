"use client";
import { Modal, Stack, Loader, Text, Alert } from "@mantine/core";
import { AlertCircle } from "lucide-react";

interface OrderProgressModalProps {
  opened: boolean;
  step: string;
  error?: string;
  onClose?: () => void;
}

export function OrderProgressModal({
  opened,
  step,
  error,
  onClose,
}: OrderProgressModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose ?? (() => {})}
      withCloseButton={!!error && !!onClose}
      centered
      size="sm"
      title={
        <Text fw={600}>
          {error ? "Error al procesar" : "Procesando orden..."}
        </Text>
      }
      closeOnClickOutside={false}
      closeOnEscape={!!error}
    >
      <Stack gap="md" py="sm">
        {error ? (
          <Alert
            icon={<AlertCircle size={16} />}
            color="red"
            title="Ocurrió un error"
          >
            <Text size="sm">{error}</Text>
          </Alert>
        ) : (
          <Stack gap="sm" align="center" py="md">
            <Loader color="amber" size="md" />
            <Text size="sm" c="dimmed" ta="center">
              {step}
            </Text>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
