# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| main    | Yes       |

## Reporting a Vulnerability

Please do NOT open a public GitHub issue for security vulnerabilities.

Email: kalp.soni2004@gmail.com

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive a response within 48 hours.

## Security Measures

- All API endpoints require Firebase JWT authentication
- Multi-tenant isolation enforced via org_id on every DB query
- No credential files stored anywhere — GCP Workload Identity used throughout
- Database on private VPC — no public IP
- Secrets stored in GCP Secret Manager
- Dependencies scanned via GitHub Dependabot
