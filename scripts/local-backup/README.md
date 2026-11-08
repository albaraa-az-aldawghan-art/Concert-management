# Local weekly backups

This Windows-only tool is separate from the web application. It never writes to the production database and does not require Firebase managed-backup billing.

## Location and schedule

`%USERPROFILE%\Documents\Concert-Backups` (the actual Windows Documents folder is resolved, including redirection).

- Sunday at 12:00 in the Windows Riyadh time zone, after the daily free quota normally resets.
- Retain the latest four successfully authenticated, structurally verified archives.
- Task runs as the current Windows user, with an interactive logon token, without storing their Windows password. That user must be logged in (the screen can be locked), the computer must be on, and the network must be available. Missed triggers run when Windows Task Scheduler can run them.
- The Node executable, this repository, and its installed dependencies must remain available. Moving/removing the project requires reinstalling the task.
- There is no cloud/off-site copy and no guarantee of recovery after loss of this PC.

## Commands (from the repository)

```powershell
node scripts/local-backup/backup.mjs init
node scripts/local-backup/backup.mjs run
node scripts/local-backup/backup.mjs self-test
node scripts/local-backup/backup.mjs verify 'C:\full\path\snapshot.cbackup'
powershell -NoProfile -File scripts/local-backup/install-task.ps1
node --test scripts/local-backup/core.test.mjs
```

If the initial database read is blocked by an exhausted quota, run the local self-test and install with `-AllowPendingFirstBackup`. This explicitly permits a pending first production backup and adds one attempt at noon the following day. It does not claim a successful production backup. A failed production attempt stays visible in `last-status.json` until a later success.

Never print `.env.local`, decrypted credentials, or authentication hashes in logs.

## Contents

- Firestore documents in every discovered collection and subcollection, including subcollections under deleted parent documents. All Firestore reads share a fixed `readTime` to avoid mixing financial updates made during the run. Original protobuf JSON values retain int64 strings, timestamp precision, map/array types, references, binary values, and geographical values.
- Firebase Authentication account records, with password hashes if the current service account can read them. Project authentication configuration is included when permitted. A warning is recorded if hashes or hash parameters are unavailable; those accounts may require password reset after recovery.
- Binary copies of HTTPS assets referenced in Firestore on Cloudinary/Firebase Storage/Google Storage. Unused/unreferenced assets and non-allowlisted external providers are outside the archive. Individual inaccessible assets are reported as warnings, never silently marked as copied. Only the referenced representation is copied, not necessarily the original Cloudinary upload or every transformation.
- Committed Git HEAD as `source.zip`, and local project `.env.local`, inside the encrypted archive. Uncommitted changes are not in the Git archive and are flagged.
- A manifest with counts, collection counts, content hashes, source commit, coverage warnings, and capture times. Authentication and external files are not an atomic database snapshot.
- Any discovered Google Cloud Storage bucket causes the backup to fail until bucket-object enumeration is implemented. This avoids claiming a full storage backup while copying only database links.

Does not export hosting dashboards, provider billing, Cloudinary account configuration, unused Cloudinary files, or infrastructure identities. The local Git repository remains the source for deployment history.

## Encryption and device dependency

Archives use AES-256-GCM with unique random nonces and gzip compression. An authentication tag rejects corruption and incorrect keys. The archive key and Firebase service-account credentials are protected with Windows DPAPI `CurrentUser`; the folder ACL grants only this Windows user and SYSTEM access.

**Copying only `.cbackup` files to another computer is insufficient. DPAPI binds the local key to the Windows user/profile. A separate portable recovery-key export must be arranged before relying on these files for whole-device disaster recovery. Do not delete the Windows profile or `key.dpapi`.** Windows administrators and malware running as this user can still access data; encryption does not replace endpoint security.

## Verification and recovery

Each completed archive is decrypted and streamed through validation before it becomes the latest successful status and before old copies are pruned. The check authenticates all bytes, verifies file SHA-256 values and document hashes/counts, rejects duplicate/foreign document paths, and reconstructs each document's REST restore representation offline without changing field values.

This check is an offline restore-format rehearsal, not a full Firebase emulator/database import. Real disaster recovery must first be tested against a separate destination project, using original document paths/fields and Auth import hash parameters when available. Never point a restore at production without an independently reviewed restore plan. Assets must be reuploaded and their URL mapping updated when moving providers. CreateTime/updateTime are archival metadata; Firestore will assign new metadata on a document restore.

The archive is a gzip-compressed JSON Lines stream encrypted after a `CONCERT-BACKUP-1\n` header and 12-byte nonce, with a trailing 16-byte GCM authentication tag. The header and nonce are authenticated additional data. Record types: metadata, document, users, authConfig, asset, source, configuration, manifest. This format is not Firebase's managed export format and cannot be passed directly to its import command.

## Failure and limits

`last-status.json` and `last-run.log` report the latest attempt. A failed attempt does not prune older verified backups. A partial archive is never treated as successful. A verified archive with a coverage warning is clearly labeled `success_with_warnings`.

Safety limits default to 20,000 documents, 1,000 referenced assets, 20 MiB per asset, 500 MiB total assets, and a maximum snapshot age of 45 minutes. Backup reads share the project's free quota with the live website. The tool cannot reserve that quota: existing usage or a larger future dataset may cause a failed run. No automatic same-day retry loop is installed to avoid repeatedly consuming the quota. Review the last-status file regularly.

## References

- https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/list
- https://firebase.google.com/docs/auth/admin/manage-users
- https://learn.microsoft.com/en-us/windows/win32/taskschd/about-the-task-scheduler
