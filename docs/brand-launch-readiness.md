# Brand launch evidence (A07)

Open `/ops/sites/<siteId>/readiness`. The server independently checks the trusted
brand/Channel/locale mapping, fresh active Saleor Channels and theme storage. It
lists required evidence for every domain and market: public DNS/TLS, product and
currency, shipping, payment/failure recovery, refunds/reconciliation, fulfillment,
policies/contact, brand emails, support and privacy/authorization boundaries.

Configure analytics libSQL storage and **individual** `OPS_OPERATORS_JSON` accounts.
Only a platform administrator with an individual account can add evidence; shared
`analytics` credentials and brand analysts remain read-only. Actor identity comes
from authenticated server configuration, not the submitted payload. Records are
append-only, brand-scoped and revision-checked; simultaneous edits yield a conflict.
The page/API preserve the latest result and the latest 40 historical records.

Every record includes environment, operator, server timestamp, evidence, expiry
and a server-generated configuration digest. Test/sandbox results remain visible
but cannot satisfy production launch acceptance. Passed production records expire
after 7 days; a relevant environment setting, Channel activation or default-homepage
publication change invalidates prior evidence. The digest contains no plaintext
credentials. Backend/store outages and any pending/failed/stale necessary check
prevent the page's launch verdict from passing.

Increment `OPS_READINESS_CONFIG_REVISION` and restart Paper after remote changes
that the server cannot observe directly (gateway account, shipping, legal policies,
DNS/infrastructure, third-party provider settings). There is no claim that every
Saleor product/stock/policy edit is automatically detected by this digest. Keep
the evidence free of passwords, API keys, full customer/payment details; reference
private redacted acceptance records instead. A manual sign-off is an operator's
attestation, not an automated payment or DNS test.

The page does not switch DNS or public routing. Existing deployments stay usable;
the operational launch verdict must be checked before exposing a new brand at the
reverse proxy. `deploy.sh` separately enforces build/backup/recovery gates. Integrating
this verdict with provider-managed DNS/traffic activation requires that provider's
deployment setup; source code alone cannot attest to the live merchant account.
