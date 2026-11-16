/* Barrel for the t4_growth workstream. Each application module registers itself on import. */
import "@/domain/seeds/market";
import "@/domain/seeds/commerce";
import "@/domain/seeds/book";
import "@/domain/seeds/proc";
import "@/domain/seeds/portal";

import "./market/index";
import "./commerce/index";
import "./book/index";
import "./proc/index";
import "./portal/index";

export {};
