"use client";

import React, { Component, useEffect, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Suppress MetaMask / chrome-extension console noise + window-level errors
// ---------------------------------------------------------------------------
function isExtensionNoise(msg: string, stack: string): boolean {
  return (
    msg.includes("MetaMask") ||
    msg.includes("Failed to connect") ||
    msg.includes("inpage.js") ||
    msg.includes("ethereum") ||
    stack.includes("chrome-extension://") ||
    stack.includes("moz-extension://")
  );
}

function useExtensionErrorSuppressor() {
  useEffect(() => {
    // 1. Patch console.error
    const originalConsoleError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const msg = typeof args[0] === "string" ? args[0] : "";
      if (isExtensionNoise(msg, "")) return;
      originalConsoleError(...args);
    };

    // 2. Intercept unhandled promise rejections (what the Next.js overlay catches)
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg   = (event?.reason as Error)?.message ?? String(event?.reason ?? "");
      const stack = (event?.reason as Error)?.stack   ?? "";
      if (isExtensionNoise(msg, stack)) {
        event.preventDefault(); // stops Next.js dev overlay from showing it
        event.stopImmediatePropagation();
      }
    };

    // 3. Intercept synchronous window errors from extension scripts
    const originalOnError = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      const msg   = typeof message === "string" ? message : "";
      const stack = error?.stack ?? "";
      const src   = typeof source  === "string" ? source  : "";
      if (isExtensionNoise(msg, stack) || src.includes("chrome-extension://") || src.includes("moz-extension://")) {
        return true; // returning true suppresses the default handler / overlay
      }
      return originalOnError ? originalOnError(message, source, lineno, colno, error) : false;
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection, true);

    return () => {
      console.error = originalConsoleError;
      window.onerror = originalOnError;
      window.removeEventListener("unhandledrejection", onUnhandledRejection, true);
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Error boundary — ignores errors from chrome-extension:// origins
// ---------------------------------------------------------------------------
type BoundaryState = { caught: boolean; error: Error | null };

class ExtensionSafeErrorBoundary extends Component<
  { children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { caught: false, error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    // Swallow errors that originate from browser extensions
    const stack = error?.stack ?? "";
    const msg   = error?.message ?? "";
    if (
      stack.includes("chrome-extension://") ||
      stack.includes("moz-extension://") ||
      msg.includes("MetaMask") ||
      msg.includes("ethereum")
    ) {
      return { caught: false, error: null }; // don't surface it
    }
    return { caught: true, error };
  }

  render() {
    if (this.state.caught) {
      return (
        <div style={{ padding: 24, color: "#fca5a5" }}>
          <strong>Application error:</strong>{" "}
          {this.state.error?.message ?? "Unknown error"}
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Combined provider shell
// ---------------------------------------------------------------------------
export default function Providers({ children }: { children: ReactNode }) {
  useExtensionErrorSuppressor();
  return (
    <ExtensionSafeErrorBoundary>{children}</ExtensionSafeErrorBoundary>
  );
}
