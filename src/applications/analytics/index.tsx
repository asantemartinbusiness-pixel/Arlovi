import { Activity } from "lucide-react";
import { Notice } from "@/design-system";
import { registerApp } from "@/platform/registry";
export const analyticsApp = registerApp({
  code: "ANALYTICS", short: "Analytics", name: "Analytics, BI & Reporting",
  purpose: "placeholder", icon: Activity, nav: [], screens: {},
  fallback: () => <Notice tone="warning" title="Placeholder">Being built.</Notice>,
});
