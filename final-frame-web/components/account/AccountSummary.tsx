import type { AccountProfile } from "@/lib/api/account";

function bytes(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  if (amount < 1024) return `${amount} B`;
  if (amount < 1024 ** 2) return `${(amount / 1024).toFixed(1)} KB`;
  if (amount < 1024 ** 3) return `${(amount / 1024 ** 2).toFixed(1)} MB`;
  return `${(amount / 1024 ** 3).toFixed(2)} GB`;
}

export default function AccountSummary({ profile }: { profile: AccountProfile }) {
  return (
    <section className="ff-account-summary" aria-label="Account overview">
      <article className="ff-account-summary-card is-profile">
        <span>Profile</span>
        <strong>{profile.name}</strong>
        <p>{profile.email}</p>
      </article>
      <article className="ff-account-summary-card">
        <span>Two-step</span>
        <strong>{profile.mfaEnabled ? "On" : "Off"}</strong>
      </article>
      <article className="ff-account-summary-card">
        <span>Storage</span>
        <strong>{bytes(profile.storageUsedBytes)}</strong>
      </article>
    </section>
  );
}
