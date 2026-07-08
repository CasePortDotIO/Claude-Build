import { getSecret } from "@/lib/config/secrets";

/**
 * Explore mode — the sample-data and simulated ("demo") mailbox/calendar/lead
 * sources are internal exploration tools, not production surfaces. They're hidden
 * from customers by default; set EXPLORE_MODE=1 (env or the in-app store) to show
 * them for your own testing. This keeps the code + fallbacks intact while the 20
 * customers only ever see real connections and real data.
 */
export async function exploreModeEnabled(): Promise<boolean> {
  const v = (await getSecret("EXPLORE_MODE"))?.toLowerCase();
  return v === "1" || v === "true" || v === "on";
}
