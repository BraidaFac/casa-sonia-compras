"use client";
import { Modal, Stack, Text, List, Button, Group } from "@mantine/core";

interface DraftWarningModalProps {
  opened: boolean;
  warnings: string[];
  onCorrect: () => void;
  onSaveAnyway?: () => void;
}

export function DraftWarningModal({
  opened,
  warnings,
  onCorrect,
  onSaveAnyway,
}: DraftWarningModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onCorrect}
      title={<Text fw={600}>Algunos campos están incompletos</Text>}
      centered
      size="sm"
    >
      <Stack gap="md">
        {warnings.length > 0 && (
          <List size="sm" spacing="xs">
            {warnings.map((w, i) => (
              <List.Item key={i}>
                <Text size="sm" c="dimmed">
                  {w}
                </Text>
              </List.Item>
            ))}
          </List>
        )}
        <Group justify="flex-end" gap="sm">
          {onSaveAnyway && (
            <Button variant="subtle" color="gray" onClick={onSaveAnyway}>
              Guardar igual
            </Button>
          )}
          <Button variant="filled" color="amber" onClick={onCorrect}>
            Corregir
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
