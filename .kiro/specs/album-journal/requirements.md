# Requirements Document

## Introduction

This feature transforms Reluxe from a simple album bookmarking tool into an **Album Journal** — a personal listening diary inspired by Letterboxd. Users will be able to log albums they've listened to, attach a 1–5 star rating, write personal notes or a review, and record the date of listening. A new Journal page will replace the current Favorites page, displaying all past entries with the ability to edit or delete them, along with a summary of the user's listening stats.

This feature also addresses four known technical issues in the existing codebase: the hardcoded JWT secret, missing duplicate-entry prevention, missing delete functionality for saved albums, a split user/data database (lowdb + Firestore), and XSS risk from unescaped innerHTML injection.

---

## Glossary

- **Journal_Entry**: A user-created record that associates an album with a star rating (1–5), optional review text, and a listened-on date.
- **Journal**: The complete, ordered collection of a user's Journal_Entries.
- **Album**: A music release retrieved from the Spotify API, identified by a Spotify album ID.
- **Rating**: An integer from 1 to 5 (inclusive) representing a user's score for an album.
- **Review**: A freeform text note (up to 2 000 characters) that a user may attach to a Journal_Entry.
- **Listened_Date**: The calendar date on which the user reports having listened to the album.
- **Journal_Page**: The frontend page (`/journal.html`) that displays a user's Journal and listening stats.
- **Stats_Panel**: The UI component on the Journal_Page that aggregates and displays listening statistics.
- **Server**: The Node.js/Express backend (`server.js`).
- **Client**: The vanilla JavaScript frontend running in the browser.
- **Database**: The consolidated Firestore collection that stores both user account data and Journal_Entries after the migration described in Requirement 8.
- **Sanitizer**: The client-side utility responsible for escaping HTML special characters before inserting user-supplied or API-supplied strings into the DOM.
- **Config**: The `.env` file and the `dotenv` package that supply runtime secrets to the Server.

---

## Requirements

### Requirement 1: Create a Journal Entry from Search Results

**User Story:** As a logged-in user, I want to log an album directly from the search results page, so that I can record my listening experience right after discovering an album.

#### Acceptance Criteria

1. WHEN the Client renders an album card in the search results, THE Client SHALL display an "Add to Journal" button on each card.
2. WHEN a user clicks "Add to Journal" on an album card, THE Client SHALL open a Journal Entry form pre-populated with the album's Spotify ID, name, artist, and cover image.
3. WHILE the Journal Entry form is open, THE form SHALL contain a star rating selector (1–5), an optional review text area (up to 2 000 characters), and a listened-on date field.
4. WHEN the listened-on date field is first displayed, THE Client SHALL pre-populate it with the current local date.
5. WHEN a user submits the Journal Entry form where a rating between 1 and 5 has been selected and the listened-on date is not in the future, THE Client SHALL send a POST request to `/api/journal` with the entry data and the user's JWT.
6. IF the Journal Entry form is submitted without a rating selected, THEN THE Client SHALL display a validation message "Please select a rating before saving" and SHALL NOT submit the form.
7. IF the Journal Entry form is submitted with a listened-on date in the future, THEN THE Client SHALL display a validation message "Listened date cannot be in the future" and SHALL NOT submit the form.
8. IF the review text exceeds 2 000 characters, THEN THE Client SHALL display a validation message "Review must be 2 000 characters or fewer" and SHALL NOT submit the form.
9. WHEN a Journal Entry is successfully saved, THE Client SHALL close the form and display a confirmation message "Entry added to your journal."
10. IF the POST request to `/api/journal` returns a non-2xx, non-409 status, THEN THE Client SHALL display an error message "Could not save entry. Please try again." and leave the form open.

---

### Requirement 2: Prevent Duplicate Journal Entries

**User Story:** As a user, I want the system to warn me if I try to log an album I've already journaled, so that I don't accidentally create duplicate entries.

#### Acceptance Criteria

1. WHEN a POST request to `/api/journal` is received, THE Server SHALL query the `journal` Firestore collection for an existing document where both `userId` matches the authenticated user's ID and `albumId` matches the submitted Spotify album ID.
2. IF a matching document is found, THEN THE Server SHALL return HTTP 409 with a JSON body containing the message "You have already logged this album." and the existing entry's `entryId`, and SHALL NOT write a new document to the `journal` collection.
3. WHEN the Client receives a 409 response from `POST /api/journal`, THE Client SHALL display the message "You have already logged this album. Would you like to edit the existing entry?" and render a link that navigates to `/journal.html` and opens the edit form pre-populated with the entry identified by the `entryId` in the 409 response body.

---

### Requirement 3: View the Journal Page

**User Story:** As a logged-in user, I want a dedicated Journal page that lists all my past entries, so that I can browse my listening history.

#### Acceptance Criteria

1. THE Server SHALL expose a `GET /api/journal` endpoint that, when called with a valid JWT, returns all Journal_Entries for the authenticated user as a JSON array ordered by `listenedDate` descending.
2. WHEN the Journal_Page loads and a valid JWT is present in `localStorage`, THE Client SHALL send a `GET /api/journal` request and render the returned Journal_Entries.
3. WHEN the Journal_Page loads and no JWT is present in `localStorage`, THE Client SHALL immediately redirect the browser to `/` without making any API calls.
4. THE Journal_Page SHALL render each Journal_Entry as a card displaying: the album cover image, album name, artist, star rating (as filled star icons), listened-on date formatted as `MMM D, YYYY`, and review text truncated to 150 characters with a "Read more" toggle that expands to the full review text.
5. WHEN a user's Journal contains zero entries, THE Journal_Page SHALL display the message "Your journal is empty. Search for an album to get started." in place of the entry grid.
6. IF the `GET /api/journal` request returns a non-2xx status, THE Client SHALL display the message "Could not load your journal. Please refresh the page."

---

### Requirement 4: Edit a Journal Entry

**User Story:** As a user, I want to edit the rating, review, or listened-on date of an existing journal entry, so that I can correct or update my record.

#### Acceptance Criteria

1. WHEN a user clicks "Edit" on a Journal_Entry card, THE Client SHALL open the Journal Entry form pre-populated with the entry's current rating, review text, and listened-on date.
2. WHEN a user submits the edit form where a rating between 1 and 5 has been selected and the listened-on date is not in the future, THE Client SHALL send a `PATCH /api/journal/:entryId` request with the updated fields and the user's JWT.
3. THE Server SHALL query the `journal` Firestore collection to confirm the document identified by `:entryId` has a `userId` field matching the authenticated user's ID before applying any update.
4. IF the `userId` on the document does not match the authenticated user's ID, THEN THE Server SHALL return HTTP 403 with the message "Forbidden" and SHALL NOT modify the document.
5. IF the document identified by `:entryId` does not exist, THEN THE Server SHALL return HTTP 404 with the message "Entry not found."
6. WHEN the `PATCH` request returns HTTP 200, THE Client SHALL update the Journal_Entry card in the DOM with the new data without a full page reload.
7. IF the edit form is submitted without a rating, THEN THE Client SHALL display the validation message "Please select a rating before saving" and SHALL NOT submit the request.

---

### Requirement 5: Delete a Journal Entry

**User Story:** As a user, I want to delete a journal entry I no longer want, so that I can keep my journal accurate.

#### Acceptance Criteria

1. WHEN a user clicks "Delete" on a Journal_Entry card, THE Client SHALL display a confirmation prompt with the text "Delete this entry? This action cannot be undone." and two actions: "Confirm" and "Cancel."
2. WHEN the user clicks "Cancel" on the confirmation prompt, THE Client SHALL dismiss the prompt and leave the Journal_Entry card unchanged.
3. WHEN the user clicks "Confirm" on the confirmation prompt, THE Client SHALL send a `DELETE /api/journal/:entryId` request with the user's JWT.
4. THE Server SHALL query the `journal` Firestore collection to confirm the document identified by `:entryId` has a `userId` field matching the authenticated user's ID before deleting it.
5. IF the `userId` on the document does not match the authenticated user's ID, THEN THE Server SHALL return HTTP 403 with the message "Forbidden" and SHALL NOT delete the document.
6. IF the document identified by `:entryId` does not exist, THEN THE Server SHALL return HTTP 404 with the message "Entry not found."
7. WHEN the `DELETE` request returns HTTP 200, THE Client SHALL remove the Journal_Entry card from the DOM without a full page reload and SHALL refresh the Stats_Panel.

---

### Requirement 6: View Listening Stats

**User Story:** As a user, I want to see a summary of my listening activity on the Journal page, so that I can track my habits and discover personal patterns.

#### Acceptance Criteria

1. THE Stats_Panel SHALL display the total count of Journal_Entries for the authenticated user.
2. THE Stats_Panel SHALL display the average Rating across all Journal_Entries rounded to one decimal place. IF no Journal_Entries exist, THE Stats_Panel SHALL display "—" in place of the average.
3. THE Stats_Panel SHALL display the album name and cover image of the Journal_Entry with the highest Rating. WHERE multiple entries share the highest Rating, THE Stats_Panel SHALL display the one with the most recent `listenedDate`. IF no entries exist, THE Stats_Panel SHALL display "No entries yet."
4. THE Stats_Panel SHALL display the count of distinct `albumId` values among Journal_Entries whose `listenedDate` falls within the current calendar month, as determined by the Client's local timezone.
5. WHEN the user has zero Journal_Entries, THE Stats_Panel SHALL display "—" in place of all numeric values and "No entries yet" in place of the top-rated album.
6. WHEN the Journal is updated (entry added, edited, or deleted), THE Client SHALL recalculate and re-render the Stats_Panel values within 2 seconds, without a full page reload.

---

### Requirement 7: Secure Configuration via Environment Variables

**User Story:** As a developer, I want all secrets and credentials loaded from environment variables, so that they are never committed to source control.

#### Acceptance Criteria

1. THE Server SHALL load `JWT_SECRET`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `GOOGLE_APPLICATION_CREDENTIALS` exclusively from environment variables using the `dotenv` package, which must be initialised before any other module reads `process.env`.
2. IF any of the four required environment variables is absent or empty at startup, THEN THE Server SHALL emit a separate `console.error` line for each missing variable identifying its name, and SHALL call `process.exit(1)`.
3. THE `.env` file SHALL be listed in `.gitignore` so that it is never tracked by git.
4. THE repository SHALL include a `.env.example` file at the project root that lists all four required variable names with descriptive placeholder values and contains no real secrets.

---

### Requirement 8: Consolidate Data Storage to Firestore

**User Story:** As a developer, I want all application data (users and journal entries) stored in a single Firestore database, so that the system is simpler to maintain and deploy.

#### Acceptance Criteria

1. THE Server SHALL store all user account records (username, hashed password, user ID, and `createdAt` timestamp) in a Firestore collection named `users`, and SHALL NOT use `lowdb` or read from or write to `db.json` for any operation.
2. THE Server SHALL store all Journal_Entries in a Firestore collection named `journal`.
3. WHEN a user registers, THE Server SHALL write the new user record to the `users` Firestore collection and return an error if the write fails.
4. WHEN a user logs in, THE Server SHALL query the `users` Firestore collection by `username` to retrieve the stored record for credential verification.
5. IF a Firestore write operation fails during user registration or journal entry creation, THE Server SHALL return HTTP 500 with the message "Database error. Please try again." and SHALL NOT return a success response.
6. IF a Firestore read operation fails during login or journal retrieval, THE Server SHALL return HTTP 500 with the message "Database error. Please try again."

---

### Requirement 9: Prevent XSS via DOM Sanitization

**User Story:** As a developer, I want all user-supplied and API-supplied strings escaped before they are inserted into the DOM, so that the application is not vulnerable to cross-site scripting attacks.

#### Acceptance Criteria

1. THE Client SHALL implement a `sanitize(str)` function that replaces `&` with `&amp;`, `<` with `&lt;`, `>` with `&gt;`, `"` with `&quot;`, and `'` with `&#039;` in the input string. IF `str` is `null` or `undefined`, the function SHALL return an empty string.
2. THE Client SHALL apply `sanitize()` to the following fields before any `innerHTML` assignment: album name, artist name, review text, and listened-on date string, in every location where these values are rendered via `innerHTML`.
3. FOR ALL strings containing one or more of the characters `&`, `<`, `>`, `"`, `'`, applying `sanitize()` then assigning to `innerHTML` SHALL produce the same visible text as assigning the original string to `textContent`.
4. WHERE the Client creates DOM nodes dynamically (search result cards, Journal_Entry cards, modal body), THE Client SHALL assign data field values using `element.textContent` or `sanitize()` rather than raw string interpolation in `innerHTML` templates.

---

### Requirement 10: Navigation and Page Structure

**User Story:** As a user, I want a consistent navigation header that takes me to the main search page and my journal, so that I can move between parts of the app easily.

#### Acceptance Criteria

1. THE Client SHALL render a navigation link labelled "My Journal" in the header of every page (`index.html`, `journal.html`), with an `href` of `/journal.html`.
2. WHILE a valid JWT is present in `localStorage`, THE Client SHALL show the "My Journal" link and the "Sign Out" button in the header, and SHALL hide the "Log In" and "Sign Up" buttons.
3. WHILE no JWT is present in `localStorage`, THE Client SHALL show the "Log In" and "Sign Up" buttons in the header, and SHALL hide the "My Journal" link and the "Sign Out" button.
4. THE Client SHALL remove the "My Favorites" navigation link from all pages and replace it with the "My Journal" link described in criterion 1.
