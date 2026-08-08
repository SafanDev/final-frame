"use client";

import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { confirmAccountSecurityAction, downloadAccountExport, type AccountProfile } from "@/lib/api/account";
import { apiRoutes } from "@/lib/api/routes";
import SecurityConfirmation from "@/components/account/SecurityConfirmation";

export default function AccountActions({ profile }: { profile: AccountProfile }) {
  return (
    <section className="ff-account-card ff-account-actions-panel" aria-labelledby="account-actions-title">
      <div className="ff-account-card-heading">
        <div>
          <h2 id="account-actions-title">Account & data</h2>
          <p className="ff-account-card-description">Exports and active sessions</p>
        </div>
      </div>

      <div className="ff-account-actions-grid">
        <SecurityConfirmation
          idPrefix="export-account"
          title="Download your data"
          description="Export your account and project data."
          mfaEnabled={profile.mfaEnabled}
          onConfirm={async (input) => {
            await downloadAccountExport({ password: input.password, ...(input.mfaCode ? { mfaCode: input.mfaCode } : {}) });
            toast.success("Account export downloaded.");
          }}
          confirmationLabel="Download"
        />
        {profile.mfaEnabled ? (
          <SecurityConfirmation
            idPrefix="disable-mfa"
            title="Turn off two-step verification"
            description="Remove the extra sign-in code."
            mfaEnabled
            onConfirm={async (input) => {
              await confirmAccountSecurityAction(apiRoutes.account.mfaDisable, input);
              await signOut({ callbackUrl: "/login" });
            }}
            confirmationLabel="Turn off"
          />
        ) : null}
        <SecurityConfirmation
          idPrefix="revoke-sessions"
          title="Sign out everywhere"
          description="End active sessions on every device."
          mfaEnabled={profile.mfaEnabled}
          onConfirm={async (input) => {
            await confirmAccountSecurityAction(apiRoutes.account.revokeSessions, input);
            await signOut({ callbackUrl: "/login" });
          }}
          confirmationLabel="Sign out"
        />
        <SecurityConfirmation
          idPrefix="delete-account"
          confirmationPhrase="DELETE"
          title="Delete account"
          description="Remove the account and private files permanently."
          mfaEnabled={profile.mfaEnabled}
          destructive
          onConfirm={async (input) => {
            await confirmAccountSecurityAction(apiRoutes.account.delete, input, "DELETE");
            await signOut({ callbackUrl: "/" });
          }}
          confirmationLabel="Delete account"
        />
      </div>
    </section>
  );
}
