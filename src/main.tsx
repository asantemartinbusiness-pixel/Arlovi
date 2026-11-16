import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { CompanyOnboarding } from "@/app/CompanyOnboarding";
import { orgBySlug } from "@/platform/org";
import { ClockProvider } from "@/platform/clock";
import { WorkspaceProvider } from "@/platform/workspace";
import { ensureSeed } from "@/runtime/db";
import { useUi } from "@/runtime/ui";
import "@/design-system";
import { loadApplications } from "@/applications";

function WorkspaceEntry() {
  let slug: string | null = null;
  try { slug = localStorage.getItem("arlovi-last-workspace"); } catch { /* browser privacy settings */ }
  const target = slug && orgBySlug(slug) ? `/o/${slug}/hq/home` : "/setup";
  return <Navigate to={target} replace />;
}

function Boot() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState("");
  const theme = useUi((state) => state.theme);
  const density = useUi((state) => state.density);
  const palette = useUi((state) => state.palette);

  useEffect(() => {
    // Applications register first so their fixtures are known to the seeder.
    // A group that fails to load is reported by the shell; the rest still boot.
    loadApplications()
      .then(() => ensureSeed())
      .then(() => setReady(true))
      .catch((error: unknown) => setFailed(error instanceof Error ? error.message : "The workspace could not be opened."));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.palette = palette;
  }, [theme, density, palette]);

  if (failed) {
    return (
      <div style={{ padding: 32 }} role="alert">
        <h1>The workspace could not be opened</h1>
        <p>{failed}</p>
      </div>
    );
  }
  if (!ready) {
    return (
      <div style={{ padding: 32, display: "flex", gap: 12, alignItems: "center" }}>
        <span className="ds-spinner" aria-hidden="true" />
        <p>Opening the local workspace…</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WorkspaceEntry />} />
        <Route path="/setup" element={<CompanyOnboarding />} />
        <Route
          path="/o/:org/*"
          element={
            <ClockProvider>
              <WorkspaceProvider>
                <AppShell />
              </WorkspaceProvider>
            </ClockProvider>
          }
        />
        <Route path="*" element={<WorkspaceEntry />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
