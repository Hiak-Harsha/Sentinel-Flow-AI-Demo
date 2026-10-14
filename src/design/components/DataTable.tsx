import React, { useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: TData) => void;
  maxHeight?: string | number;
  rowHeight?: number;
  className?: string;
}

export function DataTable<TData>({
  data,
  columns,
  loading = false,
  emptyTitle = "No records found",
  emptyDescription = "There are no entries matching your current filters.",
  onRowClick,
  maxHeight = "480px",
  rowHeight = 44,
  className = "",
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  if (loading) {
    return (
      <div className={`p-4 space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 ${className}`}>
        <Skeleton height={32} />
        <Skeleton height={40} />
        <Skeleton height={40} />
        <Skeleton height={40} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        className={className}
      />
    );
  }

  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-md ${className}`}>
      <div
        ref={tableContainerRef}
        className="overflow-auto relative"
        style={{ maxHeight }}
      >
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur-sm border-b border-slate-800">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();

                  return (
                    <th
                      key={header.id}
                      className="p-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={`flex items-center gap-1.5 ${
                            canSort ? "cursor-pointer hover:text-slate-200" : ""
                          }`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {canSort && (
                            <span className="text-slate-500">
                              {sorted === "asc" ? (
                                <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
                              ) : sorted === "desc" ? (
                                <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
                              ) : (
                                <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  data-index={virtualRow.index}
                  onClick={() => onRowClick && onRowClick(row.original)}
                  className={`border-b border-slate-800/60 transition-colors ${
                    onRowClick ? "cursor-pointer hover:bg-slate-800/60" : "hover:bg-slate-800/30"
                  }`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="p-3 text-slate-300 sf-tabular align-middle truncate"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
