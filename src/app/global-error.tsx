"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/observability/report";

/** Catches errors in the root layout itself (must render its own <html>/<body>). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { digest: error.digest, boundary: "global" });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#FAF7F2", fontFamily: "Inter, Arial, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center", background: "#fff", border: "1px solid #ece7dd", borderRadius: 14, padding: 32 }}>
            <h1 style={{ margin: "0 0 8px", fontSize: 19, fontWeight: 600, color: "#1A1A1A" }}>Something went wrong</h1>
            <p style={{ margin: "0 0 20px", fontSize: 13.5, lineHeight: 1.55, color: "#56554e" }}>
              A hiccup on our end. Please try again.
            </p>
            <button onClick={reset} style={{ background: "#1B7A57", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
