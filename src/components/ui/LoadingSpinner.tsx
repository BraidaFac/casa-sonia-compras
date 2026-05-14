import { Loader } from "@mantine/core";

interface Props {
  size?: number;
}

export function LoadingSpinner({ size = 16 }: Props) {
  return <Loader size={size} color="amber" />;
}
