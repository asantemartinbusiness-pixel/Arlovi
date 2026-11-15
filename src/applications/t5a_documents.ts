/* Barrel for the t5a_documents workstream. Each application module registers itself on import. */
import "@/domain/seeds/docs";
import "@/domain/seeds/sheets";
import "@/domain/seeds/present";
import "@/applications/docs/index";
import "@/applications/sheets/index";
import "@/applications/present/index";
