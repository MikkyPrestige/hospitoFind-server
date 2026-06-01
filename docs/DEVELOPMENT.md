# HospitoFind Backend – Development Documentation

## 1. Overview

HospitoFind is a global, AI‑assisted hospital discovery platform.
This repository contains the Node.js/Express API that powers the frontend.

The backend is responsible for:

- AI‑driven symptom‑to‑hospital matching
- A searchable directory of verified hospitals
- Admin tools for managing hospitals, users, and data imports

## 2. Architecture

### High‑level flow

```
Client (Frontend)
  │
  ▼
Express Server (app.js)
 ├── middleware/          (auth, logging, rate‑limiting, error handling)
 ├── routes/              (REST endpoints grouped by resource)
 ├── controllers/         (business logic per domain)
 ├── models/              (Mongoose schemas)
 ├── utils/               (matching engine, RAG matcher, caching, validation)
 └── config/              (DB connection, CORS, Redis)
```

### External services

| Service          | Purpose                                      |
|------------------|----------------------------------------------|
| MongoDB Atlas    | Primary data store                           |
| Redis (Upstash)  | Shared cache with in‑memory fallback         |
| Groq             | LLM for the AI chat agent                    |
| TensorFlow.js    | Local semantic embeddings for RAG matching   |
| Sentry           | Error monitoring & alerting                  |
| Overpass API     | OpenStreetMap hospital import                |
| Google Places    | (Optional) Google hospital import            |
| Resend           | Transactional emails (verification, reset)   |

## 3. Technology Stack

| Component         | Technology                       | Why                                               |
|-------------------|----------------------------------|---------------------------------------------------|
| Runtime           | Node.js (≥22, ESM)               | Modern JS, native ESM support                     |
| Framework         | Express                          | Lightweight, widely supported                     |
| Database          | MongoDB (Mongoose)               | Flexible schemas, geospatial queries              |
| Caching           | Redis (Upstash) + in‑memory fallback | Fast, shared cache with graceful degradation  |
| AI Chat           | Groq SDK (llama‑3.3‑70b)         | Fast, cost‑effective LLM                          |
| Semantic Search   | TensorFlow.js (Universal Sentence Encoder) | Zero‑cost local embeddings                |
| Authentication    | Local JWT (bcrypt) + Auth0       | Secure, flexible auth options                     |
| Validation        | Zod                              | Type‑safe schema validation                       |
| Error Tracking    | Sentry                           | Real‑time production error alerts                 |
| Testing           | Jest, Supertest                  | ESM‑compatible testing framework                  |
| CI                | GitHub Actions                   | Automated tests on push/PR                        |

## 4. Key Design Decisions

### 4.1 Hybrid Hospital Matching (Keyword + RAG)

The matching engine combines:

- **Keyword matching** using a dynamic symptom‑to‑service map
  (stored in MongoDB, cached in Redis).
- **Semantic (RAG) matching** using pre‑computed embeddings of hospital services.

The RAG layer augments keyword results – it does not replace them.
This gives both precision (exact keyword matches) and recall (semantic
understanding of vague descriptions like “tightness in my chest”).

### 4.2 Continent Pre‑filter for Performance

Before scoring, hospitals are filtered by the user’s continent
(derived from their location). This reduces the scanned set by up to
80% in global queries and keeps response times fast.

### 4.3 Full Rebuild vs. Incremental Embeddings

Currently, a **full rebuild** of the embeddings file is triggered
automatically after any hospital change (create, approve, update, delete).
The rebuild is **debounced** (5‑second quiet period) to avoid excessive
processing during bulk operations.

- **Rationale today**: ~300 verified hospitals take ~30 seconds to rebuild,
  and the full rebuild guarantees consistency without complex incremental
  logic.
- **Future plan**: switch to an incremental approach when the hospital count
  exceeds ~2,000.

### 4.4 Debounced Background Rebuilds

The `scheduleRebuild()` function can be called as many times as needed.
It will only run **one** actual rebuild, five seconds after the last call.
If a rebuild is already in progress, new requests are queued and executed
immediately after the current one finishes.

This keeps the admin API responsive (fire‑and‑forget) and guarantees no
update is missed.

### 4.5 Redis with In‑Memory Fallback

Cached data (nearby hospitals, featured hospitals, symptom mappings) lives
in Redis when available. If Redis is unreachable, the system automatically
falls back to an in‑memory `Map` with TTLs.

### 4.6 API Versioning

All routes are prefixed with `/api/v1`. Legacy routes without the prefix
are kept for backward compatibility, but new development should use `/api/v1`.

## 5. Data Pipeline

### 5.1 Hospital Sources

Hospitals enter the system through:

- **User submissions** (`POST /api/v1/hospitals`) – go to pending review.
- **Admin manual creation** (`POST /api/v1/admin/hospitals`) – created as verified.
- **OpenStreetMap import** (`POST /api/v1/admin/hospitals/import-osm`) – real
  hospitals from Overpass API, saved as unverified.
- **Google Places import** (`POST /api/v1/admin/hospitals/import-google`) –
  requires a Google API key, saved as unverified.

### 5.2 Verification Flow

All hospitals are created with `verified: false` by default. Admins can
approve or toggle verification. Only verified hospitals appear in public
listings and AI matches.

### 5.3 Symptom–Service Mapping

The mapping between symptom keywords and hospital services is stored in the
`SymptomMapping` MongoDB collection and managed through the admin API
(`/api/v1/admin/symptoms`). It is cached in Redis (30‑minute TTL) and has
a hard‑coded fallback map for cold starts.

## 6. Testing Strategy

### 6.1 Test Types

| Type        | Files                                 | Description                       |
|-------------|---------------------------------------|-----------------------------------|
| Unit        | `matchingEngine.test.mjs`             | Pure‑function matching tests      |
| Integration | `agentMatch.test.mjs`, `agentChat.test.mjs`, `auth.test.mjs` | Full endpoint tests with a database |
| Embedding   | `embedding.test.mjs`                  | Verifies TensorFlow.js embeddings |

### 6.2 Test Database

Integration tests use a separate database (`hospitofind‑test`) derived from
the main `MONGODB_URI`. Production data is never touched.

### 6.3 CI Environment

- **GitHub Actions** runs all tests on every push to `main`.
- A **MongoDB 7.0 container** is spun up for integration tests.
- `SKIP_RAG=true` prevents TensorFlow.js loading during CI (faster feedback).
  Full RAG verification can be done with `npm run test:rag`.
- Flaky tests (continent pre‑filter) use **retry loops** to handle minor
  write‑visibility delays.

### 6.4 Running Tests Locally

```bash
npm test                    # all tests (SKIP_RAG=true)
npm run test:rag            # verify full RAG pipeline
npm test -- tests/agentChat.test.mjs   # single suite
```

## 7. Deployment & CI/CD

- **Hosting**: The backend can be deployed to any Node.js platform.
- **Environment Variables**: All configuration is through `.env` (see `.env.example`).
- **CI**: GitHub Actions runs `npm test` on every push to `main`. Failures block merges.
- **Production logging**: All logs are written as JSON to the `logs/` directory
  with unique request IDs.

## 8. Known Limitations & Future Improvements

See [ROADMAP.md](ROADMAP.md) for planned future improvements.

## 9. Maintainer Notes

### Useful commands

```bash
npm run seed                # Seed database from data/hospitals.json
npm run build-embeddings    # Manually regenerate embeddings
npm run import-osm          # Manually run OSM import (script)
```