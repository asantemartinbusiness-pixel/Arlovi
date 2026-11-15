import type { TaxCategory } from "@/platform/money";
import { createStore } from "@/applications/growth/kit";

export interface CartLine {
  key: string;
  id: string;
  productId: string;
  variantId?: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxCategory: TaxCategory;
}

/** One basket per browser session, outside React so tab changes keep it. */
export function createCartStore() {
  return createStore<CartLine[]>([]);
}

export { availableFor, bodyOf, taxCategoryOfProduct } from "./data";
export type { ProductBody, Variant } from "./data";
