# HospitoFind Backend

Backend API for the HospitoFind hospital discovery platform. This service powers the frontend with AI‑driven hospital matching, a global directory of verified medical facilities, and administrative tools for managing data.

## Purpose

HospitoFind helps users find appropriate hospitals by describing their symptoms and location. The backend handles the AI conversation, hospital matching, data storage, and admin functionality.

## High‑Level Architecture

The application is built on Express and connects to a MongoDB database. Key components:

- **Express server** (`app.js`) – central app configuration, middleware, and route mounting.
- **Middleware layer** – request logging, authentication, rate limiting, error handling.
- **Route groups** – `/auth`, `/agent`, `/hospitals`, `/admin` each have their own router and controller files.
- **Controllers** – business logic for each domain (auth, AI chat, hospital search, admin operations).
- **Models** – Mongoose schemas for `User`, `Hospital`, `SymptomMapping`, and `ShareableLink`.
- **Utilities** – matching engine, semantic search (RAG), caching wrapper, geospatial helpers.

## Features

### AI‑Driven Hospital Matching
A conversational agent (Groq LLM) interviews the user to collect symptoms and location. The system then matches hospitals using a combination of keyword‑based service lookup and semantic similarity search (RAG) that understands vague descriptions like “tightness in my chest and difficulty breathing”.

### Hospital Directory
Verified hospitals can be searched by name, location, or proximity (geospatial queries). Results are filtered by continent first to keep responses fast.

### Admin Tools
Admin users can:
- Manage user accounts and roles.
- Review and approve user‑submitted hospitals.
- Import hospital data from OpenStreetMap (with a dry‑run preview) or Google Places.
- Maintain the symptom‑to‑service mapping that powers keyword matching.

### Caching
Frequently accessed data (nearby hospitals, featured listings, symptom mappings) is cached via Redis, with an automatic fallback to in‑memory storage if Redis is unavailable.

### Logging and Monitoring
Requests are logged as structured JSON with unique request IDs for tracing. Errors are automatically reported to Sentry for real‑time monitoring.

## Technology Stack

| Component         | Technology                       |
|-------------------|----------------------------------|
| Runtime           | Node.js (≥22)                    |
| Framework         | Express                          |
| Database          | MongoDB (Atlas)                  |
| Caching           | Redis (Upstash)                  |
| AI / LLM          | Groq SDK (llama‑3.3‑70b)         |
| Semantic Search   | TensorFlow.js + Universal Sentence Encoder |
| Authentication    | Local JWT + Auth0                |
| Validation        | Zod                              |
| Error Tracking    | Sentry                           |
| Testing           | Jest, Supertest                  |

## API Outline

All endpoints are grouped under `/api/v1`. Legacy paths without the version prefix are still active for backward compatibility.

- **Auth** – login, registration, token refresh, logout.
- **Agent** – AI chat (rate‑limited) and hospital matching based on the collected symptom profile.
- **Hospitals** – listing (paginated), search, nearby queries, details, featured listings, and user submissions.
- **Admin** – user and hospital management, import from OpenStreetMap or Google, symptom mapping CRUD.

Admin routes require a JWT with the `admin` role.

## Internal Notes

- Rate limits: login (10 req/15 min), AI chat (20 req/10 min). Both log violations separately.
- Semantic embeddings are stored in `data/hospital-embeddings.json`.  
They are **automatically regenerated** in the background whenever a hospital is added, approved, updated, toggled, or deleted.  
A manual rebuild can still be triggered with `npm run build-embeddings` if needed.
- The OpenStreetMap import accepts `?dryRun=true` to preview without committing data.
- Testing uses a separate database derived from the main `MONGODB_URI`. In CI, a MongoDB container is used.

---
