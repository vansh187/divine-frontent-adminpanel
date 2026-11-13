import type { CustomerSource } from "../../lib/api";

/** Every customer source, in filter order. The one list the badges, filters and CSV export use. */
export const CUSTOMER_SOURCE_LABELS: Record<CustomerSource, string> = {
  WEBSITE: "Website",
  BROKER_CHANNEL: "Channel Partner",
  OFFLINE_IMPORT: "Offline buyer",
};

/** Where a customer came from, for badges and filters. Unknown values are shown as they come. */
export function customerSourceLabel(source: string): string {
  return CUSTOMER_SOURCE_LABELS[source as CustomerSource] ?? source;
}
