# Security policy

## Reporting a vulnerability

Please do not disclose suspected vulnerabilities in a public issue. Use the repository's private security advisory form under **Security → Advisories → Report a vulnerability**.

Include the affected component, reproduction steps, impact, and any suggested mitigation. Do not include real customer data, credentials, or active secrets in the report.

## Secrets

This project does not require committed credentials. Production credentials belong in Cloudflare Worker secrets, and local-only values belong in an ignored `.dev.vars` file. If a real credential is committed, revoke or rotate it immediately before removing it from Git history.
