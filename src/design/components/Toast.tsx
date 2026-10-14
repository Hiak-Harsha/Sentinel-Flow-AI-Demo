import React from "react";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";

export const Toast: React.FC = () => {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: "#0c1322",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          color: "#f1f5f9",
          borderRadius: "0.75rem",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
          fontSize: "0.8125rem",
        },
        className: "sf-toast font-sans",
      }}
    />
  );
};

export const showToast = {
  success: (message: string, description?: string) =>
    sonnerToast.success(message, { description }),
  error: (message: string, description?: string) =>
    sonnerToast.error(message, { description }),
  warning: (message: string, description?: string) =>
    sonnerToast.warning(message, { description }),
  info: (message: string, description?: string) =>
    sonnerToast.info(message, { description }),
};
