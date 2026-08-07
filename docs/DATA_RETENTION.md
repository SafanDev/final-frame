# Data retention

FinalFrame keeps account, project, comment and approval records for the periods chosen by the app operator and required by the related agreement.

## Application cleanup

- Expired account tokens are removed after their retention window.
- Old notifications are removed after the configured number of days.
- Project deletion first blocks access, then removes private storage objects through a queue.
- Approval evidence and audit records must follow the operator's legal and contract rules.

## Storage deletion failures

A failed storage deletion stays in the cleanup queue for retry and review. Do not mark the related project as fully removed until every required private object is deleted or an approved exception is recorded.

## Backups

Database and storage backups are managed outside the app. Set a backup period, test restores, protect backup keys and record the last successful restore test.
