/* Barrel for the t2b_automation workstream. Each application module registers itself on import. */
import "@/domain/seeds/auto";
import "@/domain/seeds/analytics";
import "./auto/index";
import "./analytics/index";

export {};
