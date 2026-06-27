"use client";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridOptions } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

interface Props<T> {
  rowData: T[];
  columnDefs: ColDef<T>[];
  height?: number | string;
  onRowClicked?: (row: T) => void;
  loading?: boolean;
}

export function OrdersTable<T>({ rowData, columnDefs, height = 500, onRowClicked, loading }: Props<T>) {
  const gridOptions: GridOptions<T> = {
    defaultColDef: {
      sortable: true,
      resizable: true,
      suppressMovable: false,
    },
    animateRows: true,
    rowHeight: 48,
    headerHeight: 40,
    suppressCellFocus: true,
    onRowClicked: onRowClicked ? (e) => e.data && onRowClicked(e.data) : undefined,
  };

  return (
    <div
      className="ag-theme-alpine-dark"
      style={{
        height,
        width: "100%",
        "--ag-background-color": "var(--surface)",
        "--ag-odd-row-background-color": "var(--bg)",
        "--ag-header-background-color": "var(--surface)",
        "--ag-border-color": "var(--border)",
        "--ag-row-hover-color": "color-mix(in srgb, var(--mantine-color-amber-6) 8%, transparent)",
        "--ag-font-family": "var(--font-sans)",
        "--ag-font-size": "13px",
        "--ag-foreground-color": "var(--text)",
        "--ag-header-foreground-color": "var(--text2)",
      } as React.CSSProperties}
    >
      <AgGridReact rowData={rowData} columnDefs={columnDefs} gridOptions={gridOptions} loading={loading} pagination={true} paginationPageSize={30} />
    </div>
  );
}
