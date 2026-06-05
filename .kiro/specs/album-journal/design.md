# Design Document — Album Journal

## Overview

The Album Journal feature transforms Reluxe from a simple album bookmarking tool into a personal listening diary. Users log albums they've listened to with a star rating (1–5), an optional review, and a listened-on date. A new `/journal.html` page replaces `/favorites.html`, displaying the user's full journal with edit/delete controls and an aggregated Stats Panel.

This feature also resolves four technical debts in the existing codebase:
- **Hardcoded JWT secret** → moved to `.env` via `dotenv`
- **Split storage** (lowdb + Firestore) → consolidated to Firestore only
- **XSS risk** from unescaped `innerHTML` → mitigated by a `sanitize()` utility
- **No delete/edit** on saved albums → replaced by full CRUD on journal entries

The overall architecture does not change: Express serves static files, all data mutations go through authenticated REST endpoints, and the frontend is vanilla JavaScript with no build step.

---

## Architecture

```
Browser (Vanilla JS)
│
├── index.html + script.js        ← Search, auth, "Add to Journal" trigger
├── journal.html + journal.js     ← Journal page, Stats Panel, edit/delete
└── style.css                     ← Shared design tokens

Express Server (server.js)
│
├── POST   /register              ← Write to Firestore `users`
├── POST   /login                 ← Read from Firestore `users`
├── GET    /api/search            ← Proxy to Spotify Web API
├── GET    /api/album/:id         ← Proxy to Spotify Web API
├── POST   /api/journal           ← Create journal entry in Firestore
├── GET    /api/journal           ← List user's entries from Firestore
├── PATCH  /api/journal/:entryId  ← Update entry (ownership check)
└── DELETE /api/journal/:entryId  ← Delete entry (ownership check)

Firestore
├── users       (replaces lowdb/db.json)
└── journal     (replaces favorites)
```

### Key Design Decisions

**Why consolidate to Firestore?** Having two separate stores (lowdb for users, Firestore for favorites) creates inconsistency and makes user IDs unreliable across the boundary. Storing everything in Firestore gives a single source of truth with atomic reads.

**Why keep vanilla JS?** The existing codebase has no build step. Introducing a framework would require a bundler and add complexity disproportionate to the feature size.

**Why `PATCH` instead of `PUT` for edits?** Only rating, review, and listenedDate are editable — album metadata is immutable after creation. `PATCH` communicates partial update semantics accurately.


---

## Components and Interfaces

### 1. `sanitize(str)` — shared utility

Defined once in `script.js` and copy-pasted verbatim into `journal.js` (no module system). Escapes the five HTML special characters before any `innerHTML` assignment.

```js
/**
 * Escape HTML special characters to prevent XSS.
 * @param {string|null|undefined} str
 * @returns {string}
 */
function sanitize(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

Usage rule: every field that originates from user input or an external API (album name, artist, review text, date string) **must** pass through `sanitize()` before being placed inside an `innerHTML` template literal.

---

### 2. `script.js` — modifications to the existing `app` object

#### 2a. Remove `saveFavorite`, add `openJournalModal`

The `save-btn` class and `saveFavorite` method are removed. Album cards gain an `add-to-journal-btn`:

```js
// Inside displayAlbums(), replace the old <button class="save-btn"> markup:
`<button class="add-to-journal-btn"
        data-album-id="${sanitize(album.id)}"
        data-name="${sanitize(album.name)}"
        data-artist="${sanitize(album.artist)}"
        data-cover-image="${sanitize(album.coverImage)}">
  Add to Journal
</button>`
```

#### 2b. Journal Entry Modal HTML (injected into existing `#album-modal` or a dedicated `#journal-modal`)

A dedicated modal `#journal-modal` is added to `index.html`:

```html
<div id="journal-modal" class="modal" style="display:none;">
  <div class="modal-content journal-modal-content">
    <span class="close-journal-modal">&times;</span>
    <h2 id="jm-album-name"></h2>
    <p id="jm-artist-name"></p>
    <div class="star-rating" id="jm-stars">
      <!-- 5 star buttons rendered by JS -->
    </div>
    <p id="jm-rating-error" class="field-error" style="display:none;">
      Please select a rating before saving
    </p>
    <textarea id="jm-review" maxlength="2000"
      placeholder="Write a review (optional)…"></textarea>
    <p id="jm-review-error" class="field-error" style="display:none;">
      Review must be 2 000 characters or fewer
    </p>
    <label for="jm-date">Listened on</label>
    <input type="date" id="jm-date">
    <p id="jm-date-error" class="field-error" style="display:none;">
      Listened date cannot be in the future
    </p>
    <button id="jm-submit" class="btn btn-primary">Save to Journal</button>
    <p id="jm-message" class="message"></p>
    <!-- hidden fields -->
    <input type="hidden" id="jm-album-id">
    <input type="hidden" id="jm-cover-image">
    <input type="hidden" id="jm-entry-id"><!-- populated when editing -->
  </div>
</div>
```


#### 2c. `app` method signatures

```js
// Open the journal modal pre-populated with album data (create mode)
openJournalModal(album)
// album: { id, name, artist, coverImage }
// Sets hidden fields, populates text, sets jm-date to today, clears jm-entry-id

// Open the journal modal pre-populated with an existing entry (edit mode)
openEditModal(entry)
// entry: { entryId, albumId, albumName, artist, coverImage, rating, review, listenedDate }
// Sets jm-entry-id, populates all fields

// Submit the journal modal form (handles both create and edit)
async submitJournalForm(event)
// Validates: rating selected, date not future, review <= 2000 chars
// If jm-entry-id is empty: POST /api/journal
// If jm-entry-id is set: PATCH /api/journal/:entryId

closeJournalModal()
renderStars(container, selectedRating)
// Renders 5 interactive star buttons; highlights up to selectedRating
```

---

### 3. `journal.html` — page structure

```
header.main-header          (same markup as index.html; "My Journal" link active)
main.dashboard-container
  section.stats-panel        ← Stats Panel component
  section.journal-section
    h2 "Your Journal"
    div#journal-container.album-grid  ← entry cards or empty-state message
```

---

### 4. `journal.js` — module structure

```js
const journalApp = {
  token: null,
  username: null,
  entries: [],     // local cache updated on every mutating operation

  init(),
  checkAuth(),     // redirects to / if no token
  loadJournal(),   // GET /api/journal → this.entries → renderEntries() + renderStats()

  renderEntries(entries),
  renderEntryCard(entry),    // returns HTML string with sanitized fields
  renderStats(entries),      // computes and injects Stats Panel values

  openEditModal(entry),      // populates #journal-modal fields
  async submitEdit(event),   // PATCH /api/journal/:entryId

  confirmDelete(entryId),    // shows inline confirmation prompt
  async deleteEntry(entryId),// DELETE /api/journal/:entryId

  formatDate(isoString),     // "Jan 5, 2025" from "2025-01-05"
  computeStats(entries),     // returns { total, average, topRated, monthlyCount }
};
```

---

### 5. Stats Panel component

Rendered by `renderStats(entries)` into `section.stats-panel`. Re-called after every create, edit, or delete.

```html
<section class="stats-panel">
  <div class="stat-card">
    <p class="stat-title">Total Albums Logged</p>
    <p class="stat-value" id="stat-total">0</p>
  </div>
  <div class="stat-card">
    <p class="stat-title">Average Rating</p>
    <p class="stat-value" id="stat-avg">—</p>
  </div>
  <div class="stat-card">
    <p class="stat-title">Top Rated</p>
    <img id="stat-top-img" src="" alt="">
    <p id="stat-top-name">No entries yet</p>
  </div>
  <div class="stat-card">
    <p class="stat-title">This Month</p>
    <p class="stat-value" id="stat-monthly">0</p>
  </div>
</section>
```

`computeStats(entries)` signature and contract:

```js
/**
 * @param {JournalEntry[]} entries
 * @returns {{ total: number, average: string, topRated: JournalEntry|null, monthlyCount: number }}
 */
function computeStats(entries) {
  // total: entries.length
  // average: entries.length === 0 ? '—' : (sum of ratings / count).toFixed(1)
  // topRated: max by rating, tiebreak by most recent listenedDate; null if empty
  // monthlyCount: count of distinct albumIds where listenedDate is in current month
}
```


---

## Data Models

### Firestore `users` collection

Replaces the `lowdb` `db.json` file entirely. Each document ID is auto-generated by Firestore.

| Field           | Type      | Notes                                      |
|-----------------|-----------|--------------------------------------------|
| `id`            | `string`  | Same as Firestore document ID; used in JWT |
| `username`      | `string`  | Lowercase, must be unique (enforced by query before write) |
| `password`      | `string`  | bcrypt hash, cost factor 10                |
| `createdAt`     | `timestamp` | `admin.firestore.FieldValue.serverTimestamp()` |

Migration note: existing `db.json` users are not automatically migrated; they will simply need to re-register. The `lowdb` package and `db.json` file are removed from the project.

---

### Firestore `journal` collection

Each document represents one Journal_Entry. Document ID is auto-generated.

| Field         | Type      | Notes                                                   |
|---------------|-----------|---------------------------------------------------------|
| `entryId`     | `string`  | Firestore document ID; returned in API responses        |
| `userId`      | `string`  | ID of the owning user (from JWT payload)                |
| `albumId`     | `string`  | Spotify album ID                                        |
| `albumName`   | `string`  | Stored at write time (avoids re-fetching Spotify)       |
| `artist`      | `string`  | Comma-joined artist names                               |
| `coverImage`  | `string`  | Spotify CDN URL                                         |
| `rating`      | `number`  | Integer 1–5                                             |
| `review`      | `string`  | Up to 2 000 characters; empty string if omitted         |
| `listenedDate`| `string`  | ISO 8601 date `YYYY-MM-DD` (stored as string, not Timestamp) |
| `createdAt`   | `timestamp` | `FieldValue.serverTimestamp()`                        |
| `updatedAt`   | `timestamp` | `FieldValue.serverTimestamp()` on every write         |

`listenedDate` is stored as a plain string (`YYYY-MM-DD`) rather than a Firestore Timestamp to keep client-side date comparisons simple and avoid timezone conversion issues on reads.

---

### API request/response shapes

#### `POST /api/journal` — Create entry

Request body:
```json
{
  "albumId": "string",
  "albumName": "string",
  "artist": "string",
  "coverImage": "string",
  "rating": 4,
  "review": "string (optional, max 2000 chars)",
  "listenedDate": "2025-06-15"
}
```

Responses:
- `201 Created` → `{ "entryId": "abc123", "message": "Entry saved." }`
- `400 Bad Request` → `{ "message": "Missing required fields." }`
- `409 Conflict` → `{ "message": "You have already logged this album.", "entryId": "abc123" }`
- `500` → `{ "message": "Database error. Please try again." }`

#### `GET /api/journal` — List entries

Response `200`:
```json
[
  {
    "entryId": "abc123",
    "albumId": "...",
    "albumName": "...",
    "artist": "...",
    "coverImage": "...",
    "rating": 4,
    "review": "...",
    "listenedDate": "2025-06-15",
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```
Ordered by `listenedDate` descending (Firestore `orderBy('listenedDate', 'desc')`).

#### `PATCH /api/journal/:entryId` — Update entry

Request body (all fields optional but at least one required):
```json
{
  "rating": 5,
  "review": "Updated review text",
  "listenedDate": "2025-06-20"
}
```

Responses: `200`, `400`, `403`, `404`, `500`

#### `DELETE /api/journal/:entryId`

Responses: `200 { "message": "Entry deleted." }`, `403`, `404`, `500`

---

### `.env` file schema

```
JWT_SECRET=<random 64-char hex string>
SPOTIFY_CLIENT_ID=<your spotify client id>
SPOTIFY_CLIENT_SECRET=<your spotify client secret>
GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json
```

The `.env` file is `.gitignore`-d. A `.env.example` with placeholder values ships in the repo.

Server startup validation (runs before any route is registered):

```js
require('dotenv').config();
const REQUIRED_ENV = ['JWT_SECRET','SPOTIFY_CLIENT_ID','SPOTIFY_CLIENT_SECRET','GOOGLE_APPLICATION_CREDENTIALS'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  missing.forEach(k => console.error(`Missing required environment variable: ${k}`));
  process.exit(1);
}
```


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The `sanitize()` function, the `computeStats()` function, the validation logic in the journal modal, and the server-side authorization checks are all pure or near-pure functions with clear input/output contracts. They are well-suited to property-based testing. Infrastructure wiring (Firestore reads/writes in production), UI visual layout, and one-time startup checks are covered by integration or smoke tests instead.

**Property reflection:** After reviewing all prework analysis, the following consolidations were applied:
- 4.3 and 5.4 (authorization ownership check) are identical in structure and become a single property covering both PATCH and DELETE.
- 8.5 and 8.6 (Firestore error handling on write vs. read) share the same invariant and are combined.
- 10.2 and 10.3 (nav visibility with/without JWT) are two sides of the same invariant and combined into one property.
- 1.7 and 1.8 (future date rejection, review length rejection) become two separate properties (different generators, different conditions).
- 6.1–6.4 each produce a distinct stat and are kept as separate properties because they test different computations.
- 3.4 (review truncation) is kept as a distinct property because truncation is a non-trivial transformation.

---

### Property 1: `sanitize()` escapes all HTML-special characters

*For any* string containing any combination of the characters `&`, `<`, `>`, `"`, and `'`, calling `sanitize(str)` then assigning the result to an element's `innerHTML` SHALL produce the same visible text as assigning the original string to that element's `textContent`.

**Validates: Requirements 9.1, 9.3**

---

### Property 2: `sanitize()` handles null and undefined safely

*For any* input that is `null`, `undefined`, or any non-string falsy value, `sanitize()` SHALL return the empty string `""`.

**Validates: Requirements 9.1**

---

### Property 3: Future listened-on dates are always rejected

*For any* date string that represents a calendar date strictly after the current local date, submitting the journal entry form with that listened-on date SHALL be rejected with the message "Listened date cannot be in the future" and SHALL NOT result in a POST or PATCH request being sent.

**Validates: Requirements 1.7, 4.2**

---

### Property 4: Over-length reviews are always rejected

*For any* string whose character length exceeds 2 000, submitting the journal entry form with that string as the review SHALL be rejected with the message "Review must be 2 000 characters or fewer" and SHALL NOT result in a network request being sent.

**Validates: Requirements 1.8**

---

### Property 5: Album cards always contain the "Add to Journal" button

*For any* non-empty array of album objects returned by the search API, every card rendered by `displayAlbums()` SHALL contain exactly one element with the class `add-to-journal-btn` carrying `data-album-id`, `data-name`, `data-artist`, and `data-cover-image` attributes matching the source album.

**Validates: Requirements 1.1, 1.2**

---

### Property 6: Journal modal pre-population round-trip

*For any* album object (with id, name, artist, coverImage), calling `openJournalModal(album)` SHALL populate the hidden and visible form fields such that reading those fields back reconstructs the original album values exactly (after sanitization).

**Validates: Requirements 1.2**

---

### Property 7: GET /api/journal returns entries in descending date order

*For any* set of journal entries belonging to a user, the array returned by `GET /api/journal` SHALL be ordered so that each entry's `listenedDate` is greater than or equal to the `listenedDate` of every subsequent entry in the array.

**Validates: Requirements 3.1**

---

### Property 8: Review text truncation

*For any* review string: if its length is greater than 150 characters, `renderEntryCard()` SHALL display exactly the first 150 characters followed by a "Read more" toggle; if its length is 150 characters or fewer, the full text SHALL be displayed without a toggle.

**Validates: Requirements 3.4**

---

### Property 9: Edit modal pre-population round-trip

*For any* existing journal entry object (entryId, rating, review, listenedDate, album fields), calling `openEditModal(entry)` SHALL populate all form fields such that reading those fields back reconstructs the original entry values exactly.

**Validates: Requirements 4.1**

---

### Property 10: Server rejects unauthorized mutations

*For any* journal entry document where `document.userId !== requestingUser.id`, a PATCH or DELETE request from `requestingUser` SHALL return HTTP 403 with the message "Forbidden" and SHALL NOT modify or delete the document.

**Validates: Requirements 4.3, 4.4, 5.4, 5.5**

---

### Property 11: `computeStats` — total count

*For any* array of journal entries, `computeStats(entries).total` SHALL equal `entries.length`.

**Validates: Requirements 6.1, 6.5**

---

### Property 12: `computeStats` — average rating

*For any* non-empty array of journal entries, `computeStats(entries).average` SHALL equal `(sum of all rating values / entries.length)` rounded to one decimal place using standard rounding. For an empty array, `computeStats([]).average` SHALL equal `"—"`.

**Validates: Requirements 6.2, 6.5**

---

### Property 13: `computeStats` — top-rated album

*For any* non-empty array of journal entries, `computeStats(entries).topRated` SHALL be the entry with the highest `rating` value; where multiple entries share the highest rating, it SHALL be the one with the lexicographically greatest `listenedDate` string (most recent). For an empty array, `topRated` SHALL be `null`.

**Validates: Requirements 6.3, 6.5**

---

### Property 14: `computeStats` — monthly distinct album count

*For any* array of journal entries and any reference date, `computeStats(entries).monthlyCount` SHALL equal the number of distinct `albumId` values among entries whose `listenedDate` falls within the same calendar year and month as the reference date.

**Validates: Requirements 6.4, 6.5**

---

### Property 15: Server exits on missing environment variables

*For any* non-empty subset of the four required environment variables (`JWT_SECRET`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `GOOGLE_APPLICATION_CREDENTIALS`) that are absent or empty at startup, the server SHALL call `process.exit(1)` and SHALL emit a `console.error` line that includes the exact name of each missing variable.

**Validates: Requirements 7.2**

---

### Property 16: User registration writes to Firestore `users`

*For any* valid `(username, password)` pair where the username does not already exist, a `POST /register` request SHALL create exactly one new document in the Firestore `users` collection containing the `username`, a bcrypt hash of the `password`, and a `createdAt` timestamp, and SHALL NOT write to `db.json`.

**Validates: Requirements 8.1, 8.3**

---

### Property 17: Firestore errors always return HTTP 500

*For any* Firestore operation (read or write) that rejects with an error during `POST /register`, `POST /login`, `POST /api/journal`, `GET /api/journal`, `PATCH /api/journal/:id`, or `DELETE /api/journal/:id`, the server SHALL return HTTP 500 with the body `{ "message": "Database error. Please try again." }` and SHALL NOT return a 2xx response.

**Validates: Requirements 8.5, 8.6**

---

### Property 18: Navigation visibility invariant

*For any* page load state: when a valid JWT exists in `localStorage`, the header SHALL display the "My Journal" link and "Sign Out" button and SHALL hide the "Log In" and "Sign Up" buttons; when no JWT exists in `localStorage`, the opposite SHALL be true.

**Validates: Requirements 10.2, 10.3**


---

## Error Handling

### Client-side

All fetch calls follow the same pattern: check `response.ok`, parse JSON, display a message in the nearest `<p class="message">` element. Specific status codes trigger specific behaviors:

| Status | Location | Behavior |
|--------|----------|----------|
| 401, 403 | Any authenticated request | Clear `localStorage`, redirect to `/` |
| 409 | `POST /api/journal` | Show "already logged" message with link to edit |
| 404 | `PATCH`, `DELETE` | Show "Entry not found" — reload journal |
| 500 | Any | Show "Could not save entry. Please try again." |
| Network error (catch) | Any | Show "Could not connect to the server." |

Validation errors (missing rating, future date, review too long) are shown inline below the relevant form field without making a network request.

### Server-side

All route handlers are wrapped in `try/catch`. Firestore errors are caught and normalized to `500` with the message `"Database error. Please try again."` — Firestore error details are logged with `console.error` but never sent to the client.

Authorization is checked inside the route handler immediately after the Firestore read, before any write:

```js
if (doc.data().userId !== req.user.id) {
  return res.status(403).json({ message: 'Forbidden' });
}
```

Input validation on the server:
- `POST /api/journal`: `albumId`, `albumName`, `artist`, `rating` must be present; `rating` must be 1–5; `listenedDate` must be a valid ISO date.
- `PATCH /api/journal/:id`: at least one of `rating`, `review`, `listenedDate` must be present; same type constraints apply.

---

## Testing Strategy

### Unit tests (example-based)

Use **Jest** (Node.js), which is not yet in `package.json` and will be added as a `devDependency`.

Covered by unit tests:
- `sanitize()` with specific inputs including null, undefined, and strings with each of the five special characters
- `computeStats([])` returns correct empty-state values
- `formatDate('2025-01-05')` returns `'Jan 5, 2025'`
- Journal modal opens in create vs. edit mode (DOM manipulation tests with `jsdom`)
- Confirmation prompt appears on Delete click
- `POST /register` and `POST /login` routes with Firestore mock (`jest.mock`)
- `PATCH` and `DELETE` routes return 403 when userId mismatches
- Server startup exits when env vars are missing

### Property-based tests

Use **[fast-check](https://github.com/dubzzz/fast-check)** (TypeScript-compatible, works with Jest), added as a `devDependency`.

Each property corresponds to a numbered property in the Correctness Properties section. Each test is tagged with a comment in the format:
```
// Feature: album-journal, Property N: <property text>
```

Minimum 100 runs per property (fast-check default is 100; no override needed unless generators are expensive).

Properties implemented as property-based tests:

| Property | Test description | Generator |
|----------|-----------------|-----------|
| 1, 2 | `sanitize()` correctness | `fc.string()`, `fc.constant(null)`, `fc.constant(undefined)` |
| 3 | Future date rejection | `fc.date({ min: tomorrow })` formatted as `YYYY-MM-DD` |
| 4 | Over-length review rejection | `fc.string({ minLength: 2001 })` |
| 5 | Album cards contain button | `fc.array(albumArb, { minLength: 1 })` |
| 6 | Modal pre-population | `albumArb` |
| 7 | GET /api/journal sort order | `fc.array(entryArb, { minLength: 2 })` |
| 8 | Review truncation | `fc.string()` with varying lengths |
| 9 | Edit modal pre-population | `entryArb` |
| 10 | Unauthorized mutation → 403 | `fc.tuple(userIdArb, userIdArb).filter(([a,b]) => a !== b)` |
| 11–14 | `computeStats` correctness | `fc.array(entryArb)` with controlled ratings/dates |
| 15 | Missing env vars → process.exit | `fc.subarray(['JWT_SECRET','SPOTIFY_CLIENT_ID','SPOTIFY_CLIENT_SECRET','GOOGLE_APPLICATION_CREDENTIALS'], { minLength: 1 })` |
| 16 | Registration writes to Firestore | `fc.tuple(usernameArb, passwordArb)` |
| 17 | Firestore errors → 500 | `fc.error()` passed to Firestore mock reject |
| 18 | Nav visibility invariant | `fc.boolean()` for JWT present/absent |

### Integration / smoke tests

Run manually or in a CI step with a real Firebase emulator:
- `POST /register` → `POST /login` → `GET /api/journal` (end-to-end happy path)
- Duplicate entry returns 409
- Server starts successfully with all env vars set (smoke)
- `.gitignore` contains `.env` (smoke — file read assertion)
- `.env.example` contains all four variable names (smoke — file read assertion)

