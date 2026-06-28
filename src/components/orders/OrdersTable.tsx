"use client";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule, themeQuartz, colorSchemeDark } from "ag-grid-community";
import type { ColDef, GridOptions } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

const darkTheme = themeQuartz.withPart(colorSchemeDark);

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
    <div style={{ height, width: "100%" }}>
      <AgGridReact
        theme={darkTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        gridOptions={gridOptions}
        loading={loading}
        pagination={true}
        paginationPageSize={30}
      />
    </div>
  );
}
