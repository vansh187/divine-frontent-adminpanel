/** Buyers who share an email share one account, but each plot has its own applicant. */

const SALUTATION = /^(mr|mrs|ms|miss|dr|shri|sh|smt|kumari|km)\.?\s+/i;

/**
 * Compares applicant names the way people read them: "Mr. Rohit Mehra", "rohit  mehra" and
 * "Rohit Mehra" are one person. Only a leading salutation, case and spacing are ignored.
 */
export function applicantKey(name: string): string {
  let key = name.trim().replace(/\s+/g, " ");
  while (SALUTATION.test(key)) key = key.replace(SALUTATION, "");
  return key.toLowerCase();
}

/** The distinct applicants, each under the first spelling seen. */
export function distinctApplicants(names: (string | null | undefined)[]): string[] {
  const byKey = new Map<string, string>();
  for (const name of names) {
    const shown = name?.trim().replace(/\s+/g, " ");
    if (!shown) continue;
    const key = applicantKey(shown);
    if (key && !byKey.has(key)) byKey.set(key, shown);
  }
  return [...byKey.values()];
}

interface BookingNames {
  applicant_name?: string | null;
  customer_name?: string | null;
  customer_id: string;
}

/** Who the plot is for: its own applicant, else the account holder. */
export function bookingApplicant(b: BookingNames): string {
  return b.applicant_name?.trim() || b.customer_name?.trim() || b.customer_id;
}

/** The account holder's name when the plot's applicant is someone else; null when they are one person. */
export function otherAccountHolder(b: BookingNames): string | null {
  const applicant = b.applicant_name?.trim();
  const holder = b.customer_name?.trim();
  return applicant && holder && applicantKey(applicant) !== applicantKey(holder) ? holder : null;
}
