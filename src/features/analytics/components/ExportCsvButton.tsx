import React from "react";
import { Download } from "lucide-react";
import { Button } from "@/design/components/Button";
import { showToast } from "@/design/components/Toast";

export interface ExportCsvButtonProps {
  data: Array<Record<string, any>>;
  filename?: string;
  className?: string;
}

export function ExportCsvButton({
  data,
  filename = "sentinel-flow-telemetry-rollups.csv",
  className = "",
}: ExportCsvButtonProps) {
  const handleExport = () => {
    if (!data || data.length === 0) {
      showToast.error("Export Failed", "No rollup records available to export.");
      return;
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            if (val === null || val === undefined) return "";
            if (typeof val === "string" && val.includes(",")) return `"${val}"`;
            return val;
          })
          .join(",")
      ),
    ];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast.success("Export Complete", `Downloaded ${data.length} telemetry records.`);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className={`text-xs ${className}`}>
      <Download className="w-3.5 h-3.5 mr-1.5" />
      Export CSV
    </Button>
  );
}
