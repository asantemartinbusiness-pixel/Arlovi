/* Barrel for the t3a_money workstream (Finance & CRM). Each application module registers itself on import. */
import "@/domain/seeds/fin";
import "@/domain/seeds/crm";
import "./fin/index";
import "./crm/index";

export {};
