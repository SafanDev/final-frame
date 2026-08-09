# Data retention

Retention periods are chosen by the app operator and should match any legal or contract requirements.

## Application cleanup

- Expired account tokens are removed after their configured retention window.
- Old notifications are removed after the configured number of days.
- Project deletion blocks access first, then removes private storage objects through a cleanup queue.
- Approval evidence and audit records should follow the operator's retention rules.

## Storage deletion failures

Failed storage deletions stay in the cleanup queue for retry and review. A project should not be treated as fully removed until its required private objects are deleted or the failure has been reviewed and accepted.

## Backups

Database and storage backups are managed outside the app. Set a backup schedule, protect backup credentials, and test restores regularly.
