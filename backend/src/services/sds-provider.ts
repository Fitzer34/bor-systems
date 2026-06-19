/**
 * Product / SDS data providers used by the barcode-scan flow.
 *
 *  1. lookupProductIdentity(barcode) — FREE, no API key. Resolves a barcode to a
 *     product name + brand via the Open Facts databases so the SDS form can be
 *     pre-filled. Returns null when the product is unknown (most B2B/industrial
 *     chemicals are NOT listed there — that's expected; the flow then falls back
 *     to uploading the actual SDS). It only ever returns a name/brand, never
 *     fabricated hazards or ingredients.
 *
 *  2. lookupSdsByBarcode(barcode) — the PAID commercial SDS-database seam
 *     (Chemwatch / SDS Manager / Verisk 3E, etc.). Disabled and returns null
 *     unless SDS_PROVIDER + SDS_PROVIDER_KEY are configured. A concrete vendor
 *     adapter plugs in here once chosen; until then the flow uses the
 *     upload-the-sheet + grounded-extraction path.
 */

export interface ProductIdentity {
  name: string;
  brand: string;
  source: string; // which Open Facts database answered
}

const OPEN_FACTS: Array<[string, string]> = [
  ["Open Products Facts", "https://world.openproductsfacts.org"],
  ["Open Beauty Facts", "https://world.openbeautyfacts.org"],
  ["Open Food Facts", "https://world.openfoodfacts.org"],
];

export async function lookupProductIdentity(barcode: string): Promise<ProductIdentity | null> {
  const code = barcode.trim();
  if (!/^[0-9]{6,14}$/.test(code)) return null; // EAN/UPC/GTIN only

  for (const [label, base] of OPEN_FACTS) {
    try {
      const res = await fetch(`${base}/api/v2/product/${code}.json?fields=product_name,brands`, {
        headers: { "User-Agent": "HazardLink/1.0 (facilities SDS register)" },
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { status?: number; product?: { product_name?: string; brands?: string } };
      if (data?.status === 1 && data.product) {
        const name = (data.product.product_name || "").trim();
        const brand = (data.product.brands || "").split(",")[0]?.trim() || "";
        if (name || brand) return { name, brand, source: label };
      }
    } catch {
      // network/timeout — try the next database
    }
  }
  return null;
}

/** Partial SDS fields a paid provider could return for a barcode/product. */
export interface ProviderSds {
  productName?: string;
  manufacturer?: string;
  signalWord?: string;
  pictograms?: string[];
  hazardStatements?: { code: string; text: string }[];
  precautionaryStatements?: { code: string; text: string }[];
  ingredients?: { name: string; cas: string; percent: string }[];
  sdsPdfUrl?: string;
}

export function sdsProviderConfigured(): boolean {
  return !!process.env.SDS_PROVIDER && !!process.env.SDS_PROVIDER_KEY;
}

export async function lookupSdsByBarcode(_barcode: string): Promise<ProviderSds | null> {
  if (!sdsProviderConfigured()) return null;
  // A concrete commercial-provider adapter goes here once a vendor is chosen and
  // SDS_PROVIDER / SDS_PROVIDER_KEY are set in Render. Returning null keeps the
  // flow on the upload-the-sheet + grounded-extraction path until then.
  return null;
}
