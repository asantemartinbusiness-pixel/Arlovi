import type { Request, Response } from "../../server/integrations/shared";
import { identify, json } from "../../server/integrations/shared";
import { cloudConfigured, isUuid } from "../../server/integrations/supabaseIdentity";
import { readCloudConnectionRegistry } from "../../server/integrations/registry";

/** Read-only Arlovi Cloud registry. No provider tokens, raw OAuth credentials,
 * webhook content or untrusted browser role labels are exposed. */
export default async function handler(req: Request, res: Response) {
  if (req.method !== "GET") return json(res,405,{error:"METHOD_NOT_ALLOWED"});
  if (!cloudConfigured()) return json(res,503,{error:"CLOUD_NOT_CONFIGURED"});
  const query = new URL(req.url || "/", "https://arlovi.invalid").searchParams;
  const orgId = query.get("organizationId") || "";
  const page = Number(query.get("page") || "1");
  if (!isUuid(orgId) || !Number.isSafeInteger(page) || page < 1 || page > 10000)
    return json(res,400,{error:"INVALID_REQUEST"});
  try {
    const identity = await identify(req,orgId);
    if (!identity) return json(res,403,{error:"NOT_AUTHORISED"});
    const data = await readCloudConnectionRegistry(req.headers.authorization,identity.organizationId,page,{
      url: process.env.ARLOVI_CLOUD_SUPABASE_URL!,
      publishableKey: process.env.ARLOVI_CLOUD_SUPABASE_PUBLISHABLE_KEY!,
    });
    if (!data) return json(res,503,{error:"REGISTRY_UNAVAILABLE"});
    return json(res,200,{...data,page});
  } catch {
    return json(res,503,{error:"REGISTRY_UNAVAILABLE"});
  }
}
