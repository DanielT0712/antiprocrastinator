import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "./styles/global.css";

const designs: Record<string, () => Promise<{ default: React.ComponentType }>> =
  {
    "command-center": () => import("./designs/command-center/App"),
  };

const designName = import.meta.env.VITE_DESIGN || "command-center";
const loader = designs[designName];

if (!loader) {
  throw new Error(
    `Unknown design "${designName}". Available: ${Object.keys(designs).join(", ")}`,
  );
}

const DesignApp = lazy(loader);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-[var(--text-secondary)]">Loading...</div>
        </div>
      }
    >
      <DesignApp />
    </Suspense>
  </React.StrictMode>,
);
