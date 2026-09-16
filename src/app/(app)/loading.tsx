export default function AppLoading() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* Spinner CSS-only — no deps, renderiza en server */}
        <style>{`
          @keyframes _app-spin { to { transform: rotate(360deg); } }
          ._app-spinner {
            width: 32px;
            height: 32px;
            border: 3px solid color-mix(in srgb, var(--mantine-color-amber-6, #f59e0b) 25%, transparent);
            border-top-color: var(--mantine-color-amber-6, #f59e0b);
            border-radius: 50%;
            animation: _app-spin 0.7s linear infinite;
          }
        `}</style>
        <div className="_app-spinner" />
        <span
          style={{
            fontFamily: "var(--font-sans, sans-serif)",
            fontSize: 13,
            color: "var(--text3, #888)",
          }}
        >
          Cargando...
        </span>
      </div>
    </div>
  );
}
