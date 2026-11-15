/* Barrel for the t6_platform workstream. Each application module registers itself on import. */
import "@/domain/seeds/web";
import "@/domain/seeds/forms";
import "@/domain/seeds/build";
import "@/domain/seeds/connect";
import "@/domain/seeds/it";
import "@/applications/web/index";
import "@/applications/forms/index";
import "@/applications/build/index";
import "@/applications/connect/index";
import "@/applications/it/index";

export {};
