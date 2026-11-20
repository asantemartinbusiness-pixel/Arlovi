import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/** Team 4 id block: every fixture id sits at nl-<collection>-6NN so it cannot
 *  collide with another workstream's contributor. */
const B = 600;

/* ====================================================================== *
 * COMMERCE fixtures — Northline Atelier is a Clerkenwell lighting studio
 * selling direct and to the trade. Ids sit in the team 4 block (6NN) so they
 * never collide with the base seed or another workstream.
 * ====================================================================== */

const shift = (now: string, days: number, hour?: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  if (hour !== undefined) date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

interface Line {
  id: string;
  description: string;
  productId?: string;
  quantity: number;
  unitPriceMinor: number;
  taxCategory: string;
  discountBp?: number;
}

registerSeed("commerce", (ctx) => {
  const records: Rec[] = [];
  const rec = (input: Parameters<typeof ctx.rec>[0]) => ctx.rec({ ...input, n: input.n + B });
  const id = (org: "nl" | "hb", collection: string, n: number) => ctx.id(org, collection, n + B);
  const now = ctx.now;
  const P = (n: number) => id("nl", "products", n);
  const W = (n: number) => id("nl", "warehouses", n);
  const C = (n: number) => id("nl", "contacts", n);

  /* ---------------- Customers (also feed MARKET audiences) ---------------- */
  const customers: [number, string, string, string, string, number, number, number, boolean, boolean][] = [
    [20, "Harrow House Interiors", "orders@harrowhouse.example", "trade", "London", 6, 1_842_000, 4, true, false],
    [21, "Mireille Okafor", "mireille.okafor@example.com", "retail", "London", 2, 126_000, 61, true, true],
    [22, "Studio Vellum", "hello@studiovellum.example", "trade", "Bristol", 4, 974_000, 12, true, false],
    [23, "Tobias Lund", "tobias.lund@example.com", "retail", "Copenhagen", 1, 185_000, 120, false, false],
    [24, "Fenwick & Gray Architects", "projects@fenwickgray.example", "trade", "Manchester", 3, 1_205_000, 27, true, false],
    [25, "Nadia Brandt", "nadia.brandt@example.com", "retail", "London", 5, 412_000, 9, true, true],
    [26, "The Hoxton Rooms", "procurement@hoxtonrooms.example", "trade", "London", 2, 2_380_000, 44, true, false],
    [27, "Priyanka Rao", "p.rao@example.com", "retail", "Leeds", 1, 96_000, 210, false, false],
    [28, "Calder Joinery", "accounts@calderjoinery.example", "trade", "Glasgow", 2, 538_000, 76, true, false],
    [29, "Yusuf Demir", "yusuf.demir@example.com", "retail", "London", 3, 247_000, 18, true, false],
    [30, "Ledbury Hotel Group", "fitout@ledburyhotels.example", "trade", "London", 1, 3_120_000, 5, true, false],
    [31, "Esme Whitlock", "esme.whitlock@example.com", "retail", "Bath", 0, 0, 365, false, true],
  ];
  for (const [n, title, email, segment, city, orders, spend, daysSince, consent, marketing] of customers) {
    records.push(rec({
      org: "nl", collection: "contacts", n, title,
      summary: `${segment === "trade" ? "Trade account" : "Retail customer"} · ${city}`,
      status: "active",
      tags: [segment, ...(marketing ? ["newsletter"] : [])],
      fields: {
        email, segment, city,
        ordersCount: orders,
        spendMinor: spend,
        lastOrderAt: orders > 0 ? shift(now, -daysSince, 11) : "",
        consentEmail: consent,
        consentMarketing: marketing,
        suppressed: n === 27,
        taxStatus: city === "Copenhagen" ? "eu_business" : "domestic",
      },
    }));
  }

  /* ---------------- Warehouses ---------------- */
  records.push(
    rec({ org: "nl", collection: "warehouses", n: 20, title: "Hackney overflow", summary: "Bulk components and slow movers.", fields: { code: "HAC", managerName: "Theo Marsh", capacityUnits: 900, bins: 24 } }),
    rec({ org: "nl", collection: "warehouses", n: 21, title: "Showroom floor", summary: "Display stock available to sell off the floor.", fields: { code: "SHW", managerName: "Priya Shah", capacityUnits: 60, bins: 6 } }),
    rec({ org: "hb", collection: "warehouses", n: 20, title: "Brooklyn dock", summary: "Harbor Supply receiving bay.", fields: { code: "BKN", managerName: "Elena Ward", capacityUnits: 2_400, bins: 48 } }),
  );

  /* ---------------- Products ---------------- */
  const products: {
    n: number; title: string; sku: string; price: number; cost: number; status: string;
    tax: string; collection: string; summary: string; variants: { name: string; sku: string; priceDeltaMinor: number }[];
    seoTitle?: string;
  }[] = [
    { n: 20, title: "Beacon Floor Lamp", sku: "BCN-01", price: 185_00, cost: 92_00, status: "active", tax: "standard", collection: "Lighting",
      summary: "Spun brass floor lamp with a weighted base.",
      variants: [{ name: "Natural brass", sku: "BCN-01-NB", priceDeltaMinor: 0 }, { name: "Blackened brass", sku: "BCN-01-BB", priceDeltaMinor: 1_500 }],
      seoTitle: "Beacon brass floor lamp — Northline Atelier" },
    { n: 21, title: "Halo Wall Sconce", sku: "HAL-02", price: 96_00, cost: 41_00, status: "active", tax: "standard", collection: "Lighting",
      summary: "Wall sconce for hallways and stairwells.",
      variants: [{ name: "Single arm", sku: "HAL-02-S", priceDeltaMinor: 0 }, { name: "Double arm", sku: "HAL-02-D", priceDeltaMinor: 3_400 }] },
    { n: 22, title: "Drift Pendant", sku: "DRF-03", price: 142_00, cost: 68_00, status: "active", tax: "standard", collection: "Lighting",
      summary: "Linen-shaded pendant, three drop lengths.",
      variants: [
        { name: "600mm drop", sku: "DRF-03-600", priceDeltaMinor: 0 },
        { name: "900mm drop", sku: "DRF-03-900", priceDeltaMinor: 900 },
        { name: "1400mm drop", sku: "DRF-03-1400", priceDeltaMinor: 2_200 },
      ] },
    { n: 23, title: "Care & restoration guide", sku: "BOOK-01", price: 12_00, cost: 3_40, status: "active", tax: "zero_rated", collection: "Accessories",
      summary: "Printed guide. Books are zero-rated in the UK, not exempt.",
      variants: [{ name: "Paperback", sku: "BOOK-01-PB", priceDeltaMinor: 0 }] },
    { n: 24, title: "On-site installation", sku: "SVC-INST", price: 220_00, cost: 140_00, status: "active", tax: "standard", collection: "Services",
      summary: "Two fitters, half a day, London zones 1–3.",
      variants: [{ name: "Half day", sku: "SVC-INST-H", priceDeltaMinor: 0 }, { name: "Full day", sku: "SVC-INST-F", priceDeltaMinor: 180_00 }] },
    { n: 25, title: "Gift voucher", sku: "GIFT-01", price: 100_00, cost: 0, status: "active", tax: "outside_scope", collection: "Accessories",
      summary: "A voucher is outside the scope of VAT when issued; tax applies when redeemed.",
      variants: [{ name: "£100", sku: "GIFT-100", priceDeltaMinor: 0 }, { name: "£250", sku: "GIFT-250", priceDeltaMinor: 150_00 }] },
    { n: 26, title: "Reclaimed brass offcuts", sku: "OFF-07", price: 28_00, cost: 0, status: "draft", tax: "standard", collection: "Accessories",
      summary: "Workshop offcuts by the kilo. Copy and photography not finished.",
      variants: [{ name: "1kg", sku: "OFF-07-1", priceDeltaMinor: 0 }] },
    { n: 27, title: "Lumen Table Light", sku: "LUM-04", price: 128_00, cost: 59_00, status: "archived", tax: "standard", collection: "Lighting",
      summary: "Discontinued in the autumn range. Kept for order history.",
      variants: [{ name: "Opal", sku: "LUM-04-O", priceDeltaMinor: 0 }] },
  ];

  for (const product of products) {
    records.push(rec({
      org: "nl", collection: "products", n: product.n, title: product.title,
      status: product.status, amountMinor: product.price, summary: product.summary,
      tags: [product.collection.toLowerCase()],
      fields: {
        sku: product.sku,
        taxCategory: product.tax,
        unitCostMinor: product.cost,
        productCollection: product.collection,
        published: product.status === "active",
        reorderPoint: product.collection === "Lighting" ? 8 : 4,
        reorderQuantity: 20,
        leadTimeDays: product.collection === "Lighting" ? 21 : 10,
        seoTitle: product.seoTitle ?? "",
        seoDescription: product.seoTitle ? `${product.summary} Made in Clerkenwell.` : "",
      },
      body: {
        description: product.summary,
        variants: product.variants.map((variant, index) => ({ id: `${product.sku}-v${index + 1}`, ...variant })),
        options: [{ name: product.collection === "Services" ? "Duration" : "Finish", values: product.variants.map((variant) => variant.name) }],
        media: [{ id: `${product.sku}-m1`, label: `${product.title} on grey`, kind: "placeholder" }],
      },
    }));
  }

  /* ---------------- Stock, by product and warehouse ---------------- */
  let moveN = 20;
  const stock: [number, string, number][] = [
    [20, "nl-warehouses-001", 11], [20, W(20), 6], [20, W(21), 2],
    [21, "nl-warehouses-001", 24], [21, W(20), 10],
    [22, "nl-warehouses-001", 5], [22, W(20), 0],
    [23, "nl-warehouses-001", 140],
    [25, "nl-warehouses-001", 0],
    [26, W(20), 48],
    [27, W(20), 3],
  ];
  for (const [productN, warehouseId, quantity] of stock) {
    records.push(rec({
      org: "nl", collection: "stockMoves", n: moveN, title: `Opening count · ${products.find((item) => item.n === productN)?.sku}`,
      status: "posted", at: shift(now, -46, 9),
      summary: `Counted into ${warehouseId.split("-").pop()} at the autumn stocktake.`,
      fields: { productId: P(productN), warehouseId, quantity, kind: "count", reference: "COUNT-OCT" },
    }));
    moveN += 1;
  }
  const flows: [number, string, number, string, number, string][] = [
    [20, "nl-warehouses-001", -2, "sale", -12, "ORD-401"],
    [21, "nl-warehouses-001", -6, "sale", -9, "ORD-402"],
    [22, "nl-warehouses-001", -3, "sale", -5, "ORD-404"],
    [20, "nl-warehouses-001", 8, "receipt", -31, "GRN-81"],
    [21, W(20), -4, "transfer_out", -20, "TRF-12"],
    [21, "nl-warehouses-001", 4, "transfer_in", -20, "TRF-12"],
    [23, "nl-warehouses-001", -14, "sale", -3, "ORD-405"],
    [22, "nl-warehouses-001", -1, "adjustment", -2, "Damaged in packing"],
  ];
  for (const [productN, warehouseId, quantity, kind, days, reference] of flows) {
    records.push(rec({
      org: "nl", collection: "stockMoves", n: moveN, title: `${kind.replace("_", " ")} · ${products.find((item) => item.n === productN)?.sku}`,
      status: "posted", at: shift(now, days, 14),
      summary: reference.startsWith("ORD") ? `Picked for ${reference}.` : reference,
      fields: { productId: P(productN), warehouseId, quantity, kind, reference },
    }));
    moveN += 1;
  }

  /* ---------------- Orders ---------------- */
  const orders: {
    n: number; number: string; contact: number; status: string; fulfilment: string; payment: string;
    days: number; lines: Line[]; carrier?: string; tracking?: string; channel: string;
    /** A campaign recorded on the order by the showroom (a recorded touch, not a click). */
    campaign?: number;
  }[] = [
    { n: 20, number: "ORD-401", contact: 20, status: "delivered", fulfilment: "delivered", payment: "paid_local", days: -12, channel: "trade", campaign: 20,
      carrier: "Pallet North", tracking: "PN-884120",
      lines: [
        { id: "l1", description: "Beacon Floor Lamp · Natural brass", productId: P(20), quantity: 2, unitPriceMinor: 185_00, taxCategory: "standard" },
        { id: "l2", description: "On-site installation · Half day", productId: P(24), quantity: 1, unitPriceMinor: 220_00, taxCategory: "standard" },
      ] },
    { n: 21, number: "ORD-402", contact: 22, status: "in_transit", fulfilment: "shipped", payment: "paid_local", days: -9, channel: "trade",
      carrier: "Evri Business", tracking: "EV-7781204",
      lines: [
        { id: "l1", description: "Halo Wall Sconce · Single arm", productId: P(21), quantity: 6, unitPriceMinor: 96_00, taxCategory: "standard", discountBp: 1_000 },
      ] },
    { n: 22, number: "ORD-403", contact: 21, status: "awaiting_payment", fulfilment: "unfulfilled", payment: "not_connected", days: -2, channel: "storefront",
      lines: [
        { id: "l1", description: "Drift Pendant · 900mm drop", productId: P(22), quantity: 1, unitPriceMinor: 151_00, taxCategory: "standard" },
        { id: "l2", description: "Care & restoration guide", productId: P(23), quantity: 1, unitPriceMinor: 12_00, taxCategory: "zero_rated" },
      ] },
    { n: 23, number: "ORD-404", contact: 24, status: "unfulfilled", fulfilment: "picking", payment: "paid_local", days: -5, channel: "trade", campaign: 20,
      lines: [
        { id: "l1", description: "Drift Pendant · 1400mm drop", productId: P(22), quantity: 3, unitPriceMinor: 164_00, taxCategory: "standard" },
      ] },
    { n: 24, number: "ORD-405", contact: 25, status: "delivered", fulfilment: "delivered", payment: "paid_local", days: -3, channel: "storefront",
      carrier: "Royal Mail", tracking: "RM-9920114",
      lines: [
        { id: "l1", description: "Care & restoration guide", productId: P(23), quantity: 14, unitPriceMinor: 12_00, taxCategory: "zero_rated" },
      ] },
    { n: 25, number: "ORD-406", contact: 23, status: "awaiting_payment", fulfilment: "unfulfilled", payment: "not_connected", days: -1, channel: "storefront",
      lines: [
        { id: "l1", description: "Beacon Floor Lamp · Blackened brass", productId: P(20), quantity: 1, unitPriceMinor: 200_00, taxCategory: "standard" },
      ] },
    { n: 26, number: "ORD-407", contact: 26, status: "exception", fulfilment: "exception", payment: "paid_local", days: -7, channel: "trade",
      carrier: "Pallet North", tracking: "",
      lines: [
        { id: "l1", description: "Halo Wall Sconce · Double arm", productId: P(21), quantity: 12, unitPriceMinor: 129_40, taxCategory: "standard" },
      ] },
    { n: 27, number: "ORD-408", contact: 30, status: "cancelled", fulfilment: "cancelled", payment: "void", days: -15, channel: "trade",
      lines: [
        { id: "l1", description: "Lumen Table Light · Opal", productId: P(27), quantity: 8, unitPriceMinor: 128_00, taxCategory: "standard" },
      ] },
  ];
  for (const order of orders) {
    const net = order.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPriceMinor * (1 - (line.discountBp ?? 0) / 10_000)), 0);
    const tax = order.lines.reduce((sum, line) => sum + (line.taxCategory === "standard" ? Math.round(line.quantity * line.unitPriceMinor * (1 - (line.discountBp ?? 0) / 10_000) * 0.2) : 0), 0);
    records.push(rec({
      org: "nl", collection: "orders", n: order.n, title: order.number,
      status: order.status, amountMinor: net + tax, at: shift(now, order.days, 10),
      summary: `${customers.find((item) => item[0] === order.contact)?.[1]} · ${order.lines.length} line${order.lines.length === 1 ? "" : "s"}`,
      parentId: C(order.contact),
      tags: [order.channel],
      fields: {
        number: order.number,
        contactId: C(order.contact),
        payment: order.payment,
        fulfilment: order.fulfilment,
        channel: order.channel,
        carrier: order.carrier ?? "",
        tracking: order.tracking ?? "",
        warehouseId: "nl-warehouses-001",
        ...(order.campaign ? { campaignId: id("nl", "campaigns", order.campaign) } : {}),
        netMinor: net,
        taxMinor: tax,
        shippingMinor: order.channel === "trade" ? 4_500 : 695,
      },
      body: {
        lines: order.lines,
        shipTo: { name: customers.find((item) => item[0] === order.contact)?.[1], city: customers.find((item) => item[0] === order.contact)?.[4] },
        timeline: [
          { at: shift(now, order.days, 10), label: "Order placed", detail: order.channel === "storefront" ? "Storefront checkout in this browser." : "Entered by the showroom." },
          ...(order.payment === "paid_local" ? [{ at: shift(now, order.days, 11), label: "Payment recorded locally", detail: "Marked paid against the local ledger. No processor was involved." }] : []),
          ...(order.fulfilment === "shipped" || order.fulfilment === "delivered" ? [{ at: shift(now, order.days + 1, 9), label: "Handed to carrier", detail: `${order.carrier} · ${order.tracking || "no tracking recorded"}` }] : []),
          ...(order.fulfilment === "exception" ? [{ at: shift(now, order.days + 2, 16), label: "Carrier exception", detail: "Pallet North returned the consignment unscanned. No label was reissued." }] : []),
        ],
      },
    }));
  }

  /* ---------------- Returns ---------------- */
  records.push(
    rec({ org: "nl", collection: "returns", n: 20, title: "RET-18", status: "requested", amountMinor: 96_00,
      at: shift(now, -4, 15), summary: "Studio Vellum reports one sconce arrived with a bent arm.",
      fields: { orderId: id("nl", "orders", 21), productId: P(21), contactId: C(22), reason: "damaged", quantity: 1, restock: false, refundState: "not_connected", photos: 2 },
      body: { note: "Photographs attached by the customer. Courier claim not raised." } }),
    rec({ org: "nl", collection: "returns", n: 21, title: "RET-19", status: "in_review", amountMinor: 185_00,
      at: shift(now, -6, 11), summary: "Harrow House wants to exchange one Beacon for the blackened finish.",
      fields: { orderId: id("nl", "orders", 20), productId: P(20), contactId: C(20), reason: "wrong_finish", quantity: 1, restock: true, refundState: "exchange_pending", photos: 0 } }),
    rec({ org: "nl", collection: "returns", n: 22, title: "RET-20", status: "approved", amountMinor: 12_00,
      at: shift(now, -2, 9), summary: "Guide returned unopened within fourteen days.",
      fields: { orderId: id("nl", "orders", 24), productId: P(23), contactId: C(25), reason: "changed_mind", quantity: 1, restock: true, refundState: "awaiting_provider", photos: 0 } }),
    rec({ org: "nl", collection: "returns", n: 23, title: "RET-21", status: "completed", amountMinor: 164_00,
      at: shift(now, -21, 14), summary: "Pendant refunded in the local ledger after a credit note.",
      fields: { orderId: id("nl", "orders", 23), productId: P(22), contactId: C(24), reason: "damaged", quantity: 1, restock: false, refundState: "credit_note_local", photos: 1 } }),
    rec({ org: "nl", collection: "returns", n: 24, title: "RET-22", status: "in_review", amountMinor: 1_552_80,
      at: shift(now, -1, 17), summary: "Hoxton Rooms dispute the whole consignment after the carrier exception.",
      tags: ["disputed"],
      fields: { orderId: id("nl", "orders", 26), productId: P(21), contactId: C(26), reason: "not_received", quantity: 12, restock: false, refundState: "escalated", photos: 0, riskLevel: "high" } }),
  );

  /* ---------------- Promotions ---------------- */
  records.push(
    rec({ org: "nl", collection: "promotions", n: 20, title: "Trade 15 — winter", status: "active", at: shift(now, -14, 9),
      startAt: shift(now, -14, 0), endAt: shift(now, 21, 23),
      summary: "Fifteen percent for trade accounts on orders of six units or more.",
      fields: { kind: "percent", value: 15, code: "", minQuantity: 6, audience: "trade", stackable: false, floorMarginBp: 2_500, uses: 7 } }),
    rec({ org: "nl", collection: "promotions", n: 21, title: "WELCOME10", status: "active", at: shift(now, -40, 9),
      startAt: shift(now, -40, 0), endAt: shift(now, 60, 23),
      summary: "Ten percent off a first retail order, one use per customer.",
      fields: { kind: "code", value: 10, code: "WELCOME10", minQuantity: 1, audience: "retail", stackable: true, floorMarginBp: 3_000, uses: 23 } }),
    rec({ org: "nl", collection: "promotions", n: 22, title: "Free installation over £1,500", status: "scheduled", at: shift(now, 7, 9),
      startAt: shift(now, 7, 0), endAt: shift(now, 35, 23),
      summary: "Installation waived on fitouts above fifteen hundred net.",
      fields: { kind: "amount", value: 220_00, code: "", minSpendMinor: 1_500_00, audience: "trade", stackable: false, floorMarginBp: 2_000, uses: 0 } }),
    rec({ org: "nl", collection: "promotions", n: 23, title: "Sample sale 30", status: "ended", at: shift(now, -70, 9),
      startAt: shift(now, -75, 0), endAt: shift(now, -68, 23),
      summary: "Thirty percent on display stock in the summer sample sale.",
      fields: { kind: "percent", value: 30, code: "SAMPLE30", minQuantity: 1, audience: "all", stackable: false, floorMarginBp: 1_000, uses: 41 } }),
  );

  /* ---------------- Harbor (proves isolation) ---------------- */
  records.push(
    rec({ org: "hb", collection: "products", n: 20, title: "Dock cleat, 8 inch", status: "active", amountMinor: 42_00,
      summary: "Harbor Supply hardware. Must never appear in Northline.",
      fields: { sku: "HB-CLT-8", taxCategory: "standard", unitCostMinor: 19_00, productCollection: "Hardware", published: true, reorderPoint: 40, reorderQuantity: 200, leadTimeDays: 14 },
      body: { variants: [{ id: "HB-CLT-8-v1", name: "Galvanised", sku: "HB-CLT-8-G", priceDeltaMinor: 0 }], media: [] } }),
    rec({ org: "hb", collection: "orders", n: 20, title: "HB-220", status: "awaiting_payment", amountMinor: 457_31,
      summary: "Chris Hale · 10 cleats. New York sales tax, not VAT.",
      fields: { number: "HB-220", contactId: "hb-contacts-001", payment: "not_connected", fulfilment: "unfulfilled", channel: "storefront", netMinor: 420_00, taxMinor: 37_31, shippingMinor: 0, warehouseId: id("hb", "warehouses", 20) },
      body: { lines: [{ id: "l1", description: "Dock cleat, 8 inch · Galvanised", productId: id("hb", "products", 20), quantity: 10, unitPriceMinor: 42_00, taxCategory: "standard" }], timeline: [] } }),
    rec({ org: "hb", collection: "stockMoves", n: 20, title: "Opening count · HB-CLT-8", status: "posted",
      fields: { productId: id("hb", "products", 20), warehouseId: id("hb", "warehouses", 20), quantity: 240, kind: "count", reference: "COUNT-HB" } }),
  );

  return { records };
});
