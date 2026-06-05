# Implementation Plan: Album Journal

## Overview

Migrate Reluxe from a simple favorites tool to a full Album Journal. The plan works in six phases: (1) environment and infrastructure hardening, (2) Firestore data consolidation, (3) XSS sanitization utility, (4) backend journal API, (5) frontend journal UI, and (6) navigation and cleanup. Each phase builds on the previous so no code is left unconnected.

---

## Tasks

- [x] 1. Harden environment configuration and server startup
  - [x] 1.1 Add dotenv and env-var validation to server.js
  - [x] 1.2 Create .env.example and update .gitignore
  - [ ]* 1.3 Write property test for missing-env-var startup behaviour

- [x] 2. Consolidate storage — migrate users from lowdb to Firestore
  - [x] 2.1 Rewrite POST /register to use Firestore `users` collection
  - [x] 2.2 Rewrite POST /login to use Firestore `users` collection
  - [ ]* 2.3 Write property test for Firestore errors returning HTTP 500
  - [ ]* 2.4 Write unit tests for /register and /login routes
  - [x] 2.5 Remove lowdb artifacts

- [x] 3. Implement the sanitize() XSS utility
  - [x] 3.1 Add sanitize() to script.js and journal.js
  - [ ]* 3.2 Write property test for sanitize() escaping (Properties 1 & 2)

- [x] 4. Build the server-side journal API
  - [x] 4.1 authenticateToken uses process.env.JWT_SECRET
  - [x] 4.2 Implement POST /api/journal — create entry
  - [x] 4.3 Implement GET /api/journal — list entries
  - [ ]* 4.4 Write property test for GET /api/journal sort order
  - [x] 4.5 Implement PATCH /api/journal/:entryId — update entry
  - [x] 4.6 Implement DELETE /api/journal/:entryId — delete entry
  - [ ]* 4.7 Write property test for unauthorized mutations returning 403
  - [x] 4.8 Checkpoint — server implementation complete

- [x] 5. Build the frontend Journal page
  - [x] 5.1 Create journal.html page structure
  - [x] 5.2 Add journal-modal HTML to index.html
  - [x] 5.3 Implement computeStats() in journal.js
  - [ ]* 5.4 Write property tests for computeStats (Properties 11–14)
  - [x] 5.5 Implement sanitize(), formatDate(), renderEntryCard() in journal.js
  - [ ]* 5.6 Write property test for review text truncation (Property 8)
  - [x] 5.7 Implement renderEntries() and renderStats() in journal.js
  - [x] 5.8 Implement loadJournal(), checkAuth(), and init() in journal.js
  - [x] 5.9 Implement openJournalModal(), renderStars(), closeJournalModal() in script.js
  - [ ]* 5.10 Write property test for journal modal pre-population round-trip (Property 6)
  - [ ]* 5.11 Write property test for album cards containing Add to Journal button (Property 5)
  - [x] 5.12 Implement submitJournalForm() in script.js
  - [ ]* 5.13 Write property test for future-date rejection (Property 3)
  - [ ]* 5.14 Write property test for over-length review rejection (Property 4)
  - [x] 5.15 Implement openEditModal(), submitEdit() in journal.js
  - [ ]* 5.16 Write property test for edit modal pre-population round-trip (Property 9)
  - [x] 5.17 Implement confirmDelete() and deleteEntry() in journal.js
  - [x] 5.18 Checkpoint — journal page fully wired

- [x] 6. Update navigation and remove legacy favorites code
  - [x] 6.1 Update header navigation on index.html and journal.html
  - [ ]* 6.2 Write property test for navigation visibility invariant (Property 18)
  - [x] 6.3 Add CSS for new components to style.css
  - [x] 6.4 Remove favorites.html and favorites.js
  - [x] 6.5 Final checkpoint — all core tasks complete

---

## Notes

- Tasks marked with `*` are optional property-based tests (fast-check + Jest). All core feature tasks are complete.
- `sanitize()` is defined in both `script.js` and `journal.js` — intentional, no module bundler.
- Existing `favorites`-related Firestore documents are orphaned and can be cleaned up manually.
- Before running the server, create a `.env` file based on `.env.example` with your real credentials.
