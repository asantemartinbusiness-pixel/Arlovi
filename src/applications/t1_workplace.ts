/* Barrel for the t1_workplace workstream. Each application module registers itself on import. */
import "@/domain/seeds/inbox";
import "@/domain/seeds/admin";
import "@/domain/seeds/asset";
import "./inbox/index";
import "./admin/index";
import "./asset/index";

export {};
