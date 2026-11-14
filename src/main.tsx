import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "@/app/shell";
import { ScreenRoute } from "@/app/screen";
import { ensureSeed } from "@/runtime/db";
import { useUi } from "@/runtime/ui";
import "@/styles.css";

function App() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState("");
  const theme = useUi((state) => state.theme);
  const density = useUi((state) => state.density);
  const palette = useUi((state) => state.palette);
  useEffect(() => {
    ensureSeed().then(() => setReady(true)).catch((error: unknown) => setFailed(error instanceof Error ? error.message : "The workspace could not be opened."));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.palette = palette;
  }, [theme, density, palette]);
  if (failed) return <p role="alert">{failed}</p>;
  if (!ready) return <p>Opening the local workspace…</p>;
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/o/northline/hq/home" replace />} />
          <Route path="*" element={<ScreenRoute />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
