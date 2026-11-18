import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { CompanyOnboarding } from "@/app/CompanyOnboarding";
import { IdentityEntry, WorkspaceChooser } from "@/app/IdentityEntry";
import { orgBySlug, recoverLocalOrganizations } from "@/platform/org";
import { ClockProvider } from "@/platform/clock";
import { WorkspaceProvider } from "@/platform/workspace";
import { ensureSeed } from "@/runtime/db";
import { useUi } from "@/runtime/ui";
import { effectiveInterfaceScale } from "@/runtime/interfaceScale";
import "@/design-system";
import "@/design-system/interface-scale.css";
import { loadCoreApplications, loadAllSeeds } from "@/applications";

function WorkspaceEntry({ recoveredSlug }: { recoveredSlug: string | null }) {
  let slug: string | null = null;
  try { slug = localStorage.getItem("arlovi-last-workspace"); } catch { /* browser privacy settings */ }
  const preferred = slug && orgBySlug(slug) ? slug : recoveredSlug;
  const target = preferred && orgBySlug(preferred) ? `/o/${preferred}/workspace/home` : "/welcome";
  return <Navigate to={target} replace />;
}

function Boot() {
  const [ready, setReady] = useState(false);
  const [recoveredSlug, setRecoveredSlug] = useState<string | null>(null);
  const [failed, setFailed] = useState("");
  const theme = useUi((state) => state.theme);
  const density = useUi((state) => state.density);
  const interfaceScale = useUi((state) => state.interfaceScale);
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
        // Fixtures (data only, no screens) load once the browser is idle, so
        // cross-application references resolve without opening every app.
        const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
        // A failure is logged by the loader; screens that need every record say so.
        const background = () => { loadAllSeeds().catch(() => undefined); };
        if (idle) idle(background, { timeout: 2500 });
        else window.setTimeout(background, 1200);
        // Only the requested application loads after the core workspace opens.
        // AppShell routes initiate loading; navigation hints may prefetch it.
      })
      .catch((error: unknown) => setFailed(error instanceof Error ? error.message : "The workspace could not be opened."));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
    const effectiveScale = effectiveInterfaceScale(interfaceScale);
    document.documentElement.style.setProperty("--interface-scale", String(effectiveScale));
    // Keep layout breakpoints tied to rendered size, not the relabelled slider.
    const originalPercent = effectiveScale * 100;
    document.documentElement.dataset.scaleTier = originalPercent >= 120 ? "large" : originalPercent <= 85 ? "small" : "standard";
    document.documentElement.dataset.palette = palette;
  }, [theme, density, palette, interfaceScale]);

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
        <Route path="/welcome" element={<IdentityEntry mode="welcome"/>} />
        <Route path="/choose-workspace" element={<WorkspaceChooser/>} />
        <Route path="/auth/sign-in" element={<IdentityEntry mode="sign-in"/>} />
        <Route path="/auth/sign-up" element={<IdentityEntry mode="sign-up"/>} />
        <Route path="/auth/recover" element={<IdentityEntry mode="recover"/>} />
        <Route path="/auth/verify" element={<IdentityEntry mode="verify"/>} />
        <Route path="/auth/security" element={<IdentityEntry mode="security"/>} />
        <Route path="/auth/invite" element={<IdentityEntry mode="invite"/>} />
        <Route path="/setup" element={<CompanyOnboarding />} />
        <Route path="/setup/company" element={<Navigate to="/setup" replace/>} />
        <Route path="/setup/organization" element={<Navigate to="/setup" replace/>} />
        <Route path="/setup/review" element={<Navigate to="/setup" replace/>} />
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
