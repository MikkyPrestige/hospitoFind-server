# Backend Roadmap – Future Improvements

This document lists planned improvements for the HospitoFind backend.
Items are grouped by area and not yet scheduled.

## Security & Reliability

- **Zod validation on all write endpoints** – extend beyond `/agent/match` to cover hospital creation, admin updates, and all POST/PATCH routes.
- **Refresh‑token rotation** – issue a new refresh token on each use and invalidate the old one.
- **Two‑factor authentication (TOTP) for user and admin accounts** – ideally via Auth0.
- **Resilient Auth0 user creation** – ensure every social login creates/updates a local user document; add a fallback middleware that auto‑creates missing users from the JWT payload on any authenticated request; log and alert on failures.
- **Auth0 user backfill script** – one‑time script using the Auth0 Management API to import existing social users into MongoDB.
- **Enable Content Security Policy (CSP)** – turn on Helmet’s `contentSecurityPolicy` with a strict policy after testing.
- **Rate‑limit hospital submission and OSM import endpoints** – prevent spam and abuse.
- **Automated database backup and restore** – implement regular backups and a restore procedure beyond Atlas defaults.

## Performance & Scalability

- **Incremental embeddings** – switch from full‑rebuild to an incremental approach when verified hospitals exceed ~2,000.
- **Redis caching for hospital listing & stats** – add short‑TTL caching to paginated `GET /hospitals`, country stats, and explore endpoints.
- **Text index for hospital search** – add a MongoDB text index on `name` and `address` fields to improve `/find` performance.
- **Pagination for admin endpoints** – add `page`/`limit` to `/admin/users`, `/admin/hospitals/pending`, and `/admin/symptoms`.
- **Move embeddings to a vector database** – consider Pinecone or Chroma when hospital count grows to tens of thousands.

## AI & Matching Quality

- **Use Groq to classify symptoms → services directly** – replace static keyword matching with LLM‑based classification of user symptoms into medical services.
- **Match‑feedback endpoint** – allow users to rate matches (thumbs up/down); store feedback for future scoring adjustments.
- **Multi‑language support** – extend the system prompt and symptom mapping to handle non‑English queries.
- **Saved user preferences** – let users set preferred hospital types, languages, or accessibility needs; auto‑apply in matching.

## Admin & Data Management

- **Admin audit log for hospital edits** – track who changed what and when.
- **Batch‑delete selected pending submissions** – add `DELETE /admin/hospitals/batch` endpoint that accepts `{ ids }` and permanently removes those hospital documents.
- **Scheduled OSM imports** – set up a cron job to automatically import hospitals from key cities on a weekly basis.
- **Fuzzy duplicate detection** – use Levenshtein distance or similar to catch near‑duplicates, especially from OSM imports.

## Testing & DevOps

- **Integration tests for hospital CRUD and admin flows** – increase backend coverage beyond matching, agent, and auth.
- **Automated test for Auth0 JWKS validation** – add an integration test with a mock JWKS endpoint to verify token verification.
- **Staging environment** – set up a separate, stable environment (`staging.hospitofind.online`) for pre‑release testing.
- **Pre‑commit hooks** – add ESLint and Prettier to enforce code style before commits.