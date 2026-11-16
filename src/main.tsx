import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { CompanyOnboarding } from "@/app/CompanyOnboarding";
import { orgBySlug, recoverLocalOrganizations } from "@/platform/org";
import { ClockProvider } from "@/platform/clock";
import { WorkspaceProvider } from "@/platform/workspace";
import { ensureSeed } from "@/runtime/db";
import { useUi } from "@/runtime/ui";
import "@/design-system";
import { loadCoreApplications } from "@/applications";

function WorkspaceEntry({ recoveredSlug }: { recoveredSlug: string | null }) {
  let slug: string | null = null;
  try { slug = localStorage.getItem("arlovi-last-workspace"); } catch { /* browser privacy settings */ }
  const preferred = slug && orgBySlug(slug) ? slug : recoveredSlug;
  const target = preferred && orgBySlug(preferred) ? `/o/${preferred}/workspace/home` : "/setup";
  return <Navigate to={target} replace />;
}

function Boot() {
  const [ready, setReady] = useState(false);
  const [recoveredSlug, setRecoveredSlug] = useState<string | null>(null);
  const [failed, setFailed] = useState("");
  const theme = useUi((state) => state.theme);
  const density = useUi((state) => state.density);
  const palette = useUi((state) => state.palette);

  useEffect(() => {
    // Applications register first so their fixtures are known to the seeder.
    // A group that fails to load is reported by the shell; the rest still boot.
    loadCoreApplications()
      .then(() => ensureSeed())
      .then(() => recoverLocalOrganizations())
      .then((slug) => {
        setRecoveredSlug(slug);
        setReady(true);
        // Only the requested application loads after the core workspace opens.
        // AppShell routes initiate loading; navigation hints may prefetch it.
      })
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
        <Route path="/" element={<WorkspaceEntry recoveredSlug={recoveredSlug} />} />
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
        <Route path="*" element={<WorkspaceEntry recoveredSlug={recoveredSlug} />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
