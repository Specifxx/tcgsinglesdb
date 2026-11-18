import { INDEXNOW_KEY } from "@/lib/indexnow";

export const dynamic = "force-dynamic";
export function GET() {
  return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain", "Cache-Control": "public, s-maxage=86400" } });
}
