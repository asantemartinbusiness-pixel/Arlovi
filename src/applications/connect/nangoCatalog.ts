/**
 * Customer-facing discovery catalogue. These are suggested services, NOT a
 * declaration that an OAuth app, read action, sync or webhook is deployed.
 * A Nango integration may be offered as connectable only if the server's
 * configured-integration allowlist reports it as active.
 */
export type IntegrationGoal = "sell" | "money" | "talk" | "organise" | "team";
export type IntegrationCategory = "Commerce" | "Finance" | "Communication" | "CRM" | "Work" | "Development" | "Marketing" | "Storage";

export interface SuggestedIntegration {
  id: string;
  name: string;
  category: IntegrationCategory;
  summary: string;
  goal: IntegrationGoal;
  applications: string[];
  keywords?: string;
}

export const BUSINESS_GOALS: { id: IntegrationGoal; title: string; detail: string }[] = [
  { id: "sell", title: "Keep my sales organised", detail: "Bring orders, customers and stock into one place." },
  { id: "money", title: "Understand my money", detail: "Make invoicing and payment tracking easier." },
  { id: "talk", title: "Bring conversations together", detail: "Connect mail, messages and appointments." },
  { id: "organise", title: "Stay on top of work", detail: "Connect projects, files and everyday tasks." },
  { id: "team", title: "Support my people", detail: "Coordinate hiring, HR and team operations." },
];

export const SUGGESTED_INTEGRATIONS: SuggestedIntegration[] = [
  { id: "shopify", name: "Shopify", category: "Commerce", summary: "Bring store orders, customers and products together.", goal: "sell", applications: ["Commerce","CRM","Finance"], keywords: "online shop retail ecommerce" },
  { id: "woocommerce", name: "WooCommerce", category: "Commerce", summary: "Connect your WooCommerce store with your business workspace.", goal: "sell", applications: ["Commerce","Finance"], keywords: "wordpress store" },
  { id: "bigcommerce", name: "BigCommerce", category: "Commerce", summary: "Connect online selling with business operations.", goal: "sell", applications: ["Commerce","CRM"] },
  { id: "stripe", name: "Stripe", category: "Finance", summary: "Track payments and connect transaction information.", goal: "money", applications: ["Finance","Commerce"], keywords: "card payments" },
  { id: "paypal", name: "PayPal", category: "Finance", summary: "Organise payment information alongside your business records.", goal: "money", applications: ["Finance","Commerce"] },
  { id: "xero", name: "Xero", category: "Finance", summary: "Bring accounting records and invoicing into your workflow.", goal: "money", applications: ["Finance"] },
  { id: "quickbooks-online", name: "QuickBooks Online", category: "Finance", summary: "Connect accounting and financial information.", goal: "money", applications: ["Finance"] },
  { id: "google-mail", name: "Gmail", category: "Communication", summary: "Bring business conversations into Communications.", goal: "talk", applications: ["Communications","CRM"], keywords: "google workspace email" },
  { id: "microsoft-graph", name: "Microsoft 365", category: "Communication", summary: "Connect Microsoft mail, calendar and productivity services.", goal: "talk", applications: ["Communications","People"], keywords: "office outlook teams" },
  { id: "slack", name: "Slack", category: "Communication", summary: "Link team conversations to shared work.", goal: "talk", applications: ["Communications","Projects"] },
  { id: "twilio", name: "Twilio", category: "Communication", summary: "Connect supported messaging and phone services.", goal: "talk", applications: ["Communications","CRM"], keywords: "sms voice calls" },
  { id: "hubspot", name: "HubSpot", category: "CRM", summary: "Link customers, leads and sales activity.", goal: "sell", applications: ["CRM","Growth"] },
  { id: "salesforce", name: "Salesforce", category: "CRM", summary: "Bring customer records into a joined-up workflow.", goal: "sell", applications: ["CRM","Growth"] },
  { id: "pipedrive", name: "Pipedrive", category: "CRM", summary: "Connect pipeline information and sales work.", goal: "sell", applications: ["CRM","Growth"] },
  { id: "asana", name: "Asana", category: "Work", summary: "Connect tasks and project progress.", goal: "organise", applications: ["Projects"] },
  { id: "linear", name: "Linear", category: "Work", summary: "Link issues and project execution.", goal: "organise", applications: ["Projects"] },
  { id: "jira", name: "Jira", category: "Work", summary: "Coordinate tracked development and service work.", goal: "organise", applications: ["Projects"] },
  { id: "notion", name: "Notion", category: "Work", summary: "Connect team knowledge and organised work.", goal: "organise", applications: ["Projects","Knowledge"] },
  { id: "google-drive", name: "Google Drive", category: "Storage", summary: "Bring approved company files into your workspace.", goal: "organise", applications: ["Documents"] },
  { id: "dropbox", name: "Dropbox", category: "Storage", summary: "Connect documents and shared file collections.", goal: "organise", applications: ["Documents"] },
  { id: "github-app", name: "GitHub", category: "Development", summary: "Link repositories, issues and engineering work.", goal: "organise", applications: ["Projects","IT"], keywords: "code repositories" },
  { id: "gitlab", name: "GitLab", category: "Development", summary: "Connect software projects and development activity.", goal: "organise", applications: ["Projects","IT"] },
  { id: "mailchimp", name: "Mailchimp", category: "Marketing", summary: "Connect marketing campaigns and audiences.", goal: "sell", applications: ["Growth"] },
  { id: "klaviyo", name: "Klaviyo", category: "Marketing", summary: "Coordinate commerce and customer marketing.", goal: "sell", applications: ["Growth","Commerce"] },
  { id: "bamboohr", name: "BambooHR", category: "Work", summary: "Connect employee information with people operations.", goal: "team", applications: ["People"] },
  { id: "deel", name: "Deel", category: "Work", summary: "Connect workforce and contractor operations.", goal: "team", applications: ["People","Finance"] },
];

export function suggestedForGoal(goal: IntegrationGoal): SuggestedIntegration[] {
  return SUGGESTED_INTEGRATIONS.filter(item => item.goal === goal);
}
