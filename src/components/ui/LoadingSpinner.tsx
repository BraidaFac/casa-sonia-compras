import { Loader } from "@mantine/core";

interface Props {
  size?: number;
  label?: string;
}

export function LoadingSpinner({ size = 16, label }: Props) {
  if (label) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 48,
          color: "var(--text2)",
          fontFamily: "var(--font-sans)",
        }}
      >
        <Loader size={size} color="amber" />
        {label}
      </div>
    );
  }
  return <Loader size={size} color="amber" />;
}
