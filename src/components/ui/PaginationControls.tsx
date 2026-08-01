import { Button, Group, Text } from "@mantine/core";

interface PaginationControlsProps {
  total: number;
  offset: number;
  limit: number;
  onNext: () => void;
  onPrev: () => void;
  entityLabel: string;
}

export function PaginationControls({
  total,
  offset,
  limit,
  onNext,
  onPrev,
  entityLabel,
}: PaginationControlsProps) {
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <Group justify="space-between" mt="md">
      <Text size="xs" c="dimmed">
        {total} {entityLabel}
      </Text>
      <Group gap="xs">
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          disabled={!hasPrev}
          onClick={onPrev}
        >
          ← Anterior
        </Button>
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          disabled={!hasNext}
          onClick={onNext}
        >
          Siguiente →
        </Button>
      </Group>
    </Group>
  );
}
