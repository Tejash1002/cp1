# Ask a Query & Forum Engine

## Overview

The Ask a Query & Forum Engine provides a structured community support system where users can post questions, receive answers, participate in threaded discussions, vote on content, bookmark useful queries, and finalize solutions. The module combines traditional forum functionality with AI-assisted quality control, duplicate detection, and automated solution resolution workflows.

The implementation is distributed across frontend pages (`AskQuery.jsx`, `QueryList.jsx`, `QueryDetail.jsx`) and backend services (`queryService.js`, `answerService.js`, `solutionService.js`, `gibberishService.js`, `spamService.js`, and `vectorService.js`).

Key capabilities include:

* Structured query submission
* Category and tag taxonomy enforcement
* Screenshot attachments
* AI-assisted grammar correction
* Gibberish detection
* Spam prevention and penalty escalation
* Duplicate query detection using vector similarity
* Hybrid keyword and semantic search
* Answer management
* Threaded comments
* Voting and bookmarking
* Helpful answer selection
* Automated solution finalization

---

# Architecture Overview

The Ask a Query module follows a layered architecture:

```text
AskQuery.jsx
    │
    ▼
POST /api/queries
    │
    ▼
queryService.createQuery()
    ├── Taxonomy Validation
    ├── Gibberish Detection
    ├── Spam Enforcement
    ├── Embedding Generation
    ├── Duplicate Detection
    └── Query Storage

QueryList.jsx
    │
    ▼
queryService.listQueries()
    ├── Filtering
    ├── Search
    ├── Pagination
    └── Answer Count Aggregation

QueryDetail.jsx
    │
    ├── Query Voting
    ├── Query Bookmarking
    ├── Answer Creation
    ├── Helpful Marking
    ├── Comment Management
    └── Resolution Workflow

solutionService
    │
    ▼
Automatic Finalization
```

The backend services collaborate to enforce validation, moderation, duplicate prevention, and lifecycle management throughout the query resolution process.

---

# Question Posting Workflow

## Query Submission Interface

The query creation interface is implemented in `AskQuery.jsx`.

Users are required to provide:

| Field         | Required |
| ------------- | -------- |
| Title         | Yes      |
| Body          | Yes      |
| Category      | Yes      |
| Tags          | Yes      |
| Joining Date  | Yes      |
| Contact Email | Yes      |
| Attachments   | Optional |

Anonymous posting is not supported. Any anonymous flag is ignored and forced to `false` on the server.

---

## Category Selection

Categories are loaded dynamically:

```http
GET /api/taxonomy?kind=category
```

The user must select a category from the administrator-maintained taxonomy list.

No free-form categories are accepted.

---

## Tag Selection

Tags are loaded dynamically:

```http
GET /api/taxonomy?kind=tag
```

Tags are selected through predefined checkboxes.

Custom user-generated tags are not permitted.

---

## Attachment Support

The query form supports multiple image uploads.

```html
<input
  type="file"
  multiple
  accept="image/*"
/>
```

Attachments are submitted using:

```text
multipart/form-data
```

Uploaded attachments are displayed within the interface using a lightbox viewer.

The query detail page allows users to view attachment counts and open images in a zoomable preview.

---

## Grammar Correction Workflow

Before submitting a query, users may optionally perform grammar correction.

```http
POST /api/queries/autocorrect
```

The API returns:

```json
{
  "corrected": "...",
  "changes": [...]
}
```

A diff modal presents the proposed corrections.

The user may:

* Accept all changes
* Keep the original content

When corrections are accepted, both corrected content and original content are submitted.

---

## Query Creation Pipeline

Query creation is performed through:

```http
POST /api/queries
```

Backend execution sequence:

```text
queryController.createQuery()
    ↓
queryService.createQuery()
```

The service performs the following operations:

1. Input coercion
2. Taxonomy validation
3. Joining date validation
4. Contact email validation
5. Anonymous flag enforcement
6. Gibberish detection
7. Spam handling
8. Embedding generation
9. Duplicate detection
10. Query persistence

---

# Taxonomy Management

The platform uses a controlled taxonomy model.

Categories and tags are validated against records stored in the taxonomy collection.

Validation occurs during:

* Query creation
* Query update
* Moderator re-categorization

Invalid values immediately generate validation failures.

Example validation:

```text
Taxonomy.findOne({
  kind,
  name
})
```

Only administrator-approved taxonomy values may be used.

---

# Gibberish Detection Pipeline

The system implements a two-layer content quality gate.

---

## Layer 1: Heuristic Validation

Every submitted query body passes through heuristic analysis.

Checks include:

### Minimum Length

Very short submissions are rejected immediately.

### Repeated Character Detection

Examples:

```text
aaaaaaaaaaaa
!!!!!!!!!!!!
```

The service calculates a repeated-character ratio and rejects excessive repetition.

### Dictionary Word Ratio

The service evaluates:

```text
recognized_words / total_words
```

A low ratio indicates nonsensical content.

---

## Layer 1 Outcomes

### Pass

Content is considered valid.

### Fail

Content is immediately rejected.

### Borderline

Content is escalated to Layer 2 AI analysis.

---

## Layer 2: AI Evaluation

Borderline content triggers AI-based validation.

The service calls:

```text
ai.js cheapCall()
```

Expected response:

```json
{
  "isvalid": true,
  "confidence": 0.92,
  "reason": "..."
}
```

The AI determines whether the content appears meaningful.

---

## Fail-Open Strategy

If the AI service:

* Returns HTTP 429
* Times out
* Encounters an error

The submission is treated as valid.

This prevents legitimate users from being blocked during AI quota exhaustion.

---

# Spam Prevention & Penalty System

Spam enforcement is handled by `spamService.js`.

A user's spam history is tracked through:

```text
user.spamflagcount
```

Spam flags are generated when gibberish detection fails.

---

## Penalty Escalation Levels

| Offense Count | Action                                         |
| ------------- | ---------------------------------------------- |
| 1             | Warning notification                           |
| 2             | Warning badge + 24-hour ban                    |
| 5             | Restricted badge + moderator approval required |
| 10            | Permanent suspension                           |

---

## Enforcement Flow

```text
gibberishService.check()
       │
       ├── Pass
       │     ↓
       │   Continue
       │
       └── Fail
             ↓
     Increment spamflagcount
             ↓
     spamService.applySpamPenalty()
```

Each penalty update is persisted to the user record and generates appropriate notifications.

---

# Duplicate Detection & Vector Search

The platform uses embedding-based similarity detection to identify duplicate questions.

## Embedding Generation

After content validation:

```text
ai.js.embed(title + body)
```

An embedding vector is generated and stored with the query.

The embedding becomes the basis for semantic search and duplicate detection.

---

## Similarity Search

Generated embeddings are compared against existing queries using:

```text
vectorService.findSimilarQueries()
```

The service:

1. Loads stored query embeddings
2. Computes cosine similarity
3. Filters by threshold
4. Returns ranked matches

Similarity calculations are performed using:

```text
computeCosineSimilarity()
```

---

## Duplicate Detection Logic

When similarity exceeds the configured threshold:

```text
similarity > 0.80
```

the query is marked as a potential duplicate.

Query fields updated:

```text
isflaggedduplicate
duplicateof
similarityscore
```

A moderation record is also created.

# Query Discovery & Search

The query discovery system enables users to browse, search, and filter community questions through the `QueryList.jsx` interface and the query service layer.

## Query Listing

Queries are retrieved through:

```http
GET /api/queries
```

The backend supports:

* Status filtering
* Category filtering
* Tag filtering
* Pagination
* Full-text search
* Resolved-last ordering

All filter values received through request parameters are coerced to strings before entering MongoDB filters to prevent malformed query injection.

---

## Search Functionality

The platform supports two search mechanisms:

### Full-Text Search

MongoDB text indexes are used for keyword-based searching.

```http
GET /api/queries?q=<search-term>
```

### Semantic Search

The search service also performs embedding-based similarity search.

```http
GET /api/queries/search
```

Semantic search uses stored embeddings and cosine similarity calculations to locate conceptually similar queries even when exact keywords differ.

---

## Pagination

Query listings support page-based navigation.

Returned metadata includes:

* page
* limit
* total

The frontend renders navigation controls using these values.

---

## Query Ordering

Resolved queries are intentionally pushed toward the bottom of search results.

Sorting behavior:

```text
Resolved Queries → Bottom
Newest Queries → Top
```

This ensures active discussions remain visible.

---

# Answers & Threaded Comments

Answer management is implemented through `answerService.js` and rendered through `QueryDetail.jsx`.

## Answer Creation

Answers are submitted through:

```http
POST /api/queries/:id/answers
```

Validation rules:

* User must not be banned.
* Query author cannot answer their own question.
* Query status must be Open or Answered.
* Resolved or Archived queries cannot receive new answers.

When an answer is successfully created:

1. Answer document is saved.
2. Query status changes from Open to Answered.
3. Query author receives a notification.

---

## Answer Editing

Answers may be edited only within a 15-minute window.

Conditions:

* User is the answer author.
* User is a moderator.
* User is an administrator.

The original answer body is preserved when modifications occur.

---

## Answer Deletion

The platform uses soft deletion.

Deleted answers receive:

```text
isdeleted
deletedat
deletedby
```

Status reconciliation is automatically performed.

Examples:

* Removing an accepted answer clears the accepted answer reference.
* Queries never remain resolved without a valid accepted answer.
* If all answers are removed, the query returns to Open status.

---

## Threaded Comments

Comments provide limited discussion under answers.

### Permissions

Only two users may participate:

* Query author
* Answer author

Any other user receives an authorization error.

---

## Comment Creation

```http
POST /api/answers/:id/comments
```

Workflow:

1. Permission validation.
2. Comment creation.
3. Notification sent to the other participant.

---

## Comment Deletion

Comments use soft deletion and may be removed by:

* Comment author
* Moderator
* Administrator

---

# Helpful Answer & Resolution Workflow

The platform follows a support-ticket-style resolution model.

## Mark Helpful

Authorized users:

* Query author
* Moderator
* Administrator

Endpoint:

```http
POST /api/queries/:id/answers/:answerId/helpful
```

Actions performed:

1. Answer marked as accepted.
2. Accepted answer ID stored on the query.
3. Query status changed to Resolved.
4. Thread closure enforced.
5. Answer author awarded reputation points.
6. Notification generated.

---

## Accepted Answer Display

Accepted answers appear with:

```text
✓ Solution
```

Accepted answers are always prioritized in thread ordering.

---

## Unmark Helpful

Authorized users may reopen discussions.

Actions:

1. Remove accepted answer association.
2. Clear acceptance flag.
3. Change query status back to Answered.

Previously awarded points remain unchanged.

---

# Voting & Bookmarking

The platform supports voting on both queries and answers.

---

## Query Voting

Endpoint:

```http
POST /api/queries/:id/vote
```

Features:

* Upvote
* Downvote
* Self-vote prevention

Votes are stored separately and aggregated into a query vote score.

---

## Answer Voting

Endpoint:

```http
POST /api/answers/:id/vote
```

Answer votes use signed values:

```text
+1 = Upvote
-1 = Downvote
```

Rules:

* Self-voting is blocked.
* Only positive votes contribute to reputation.
* Downvotes are recorded but do not reduce reputation.

---

## Bookmarking

Users can save useful queries.

Endpoints:

```http
POST /api/queries/:id/save
DELETE /api/queries/:id/save
```

Bookmarks are stored using a dedicated bookmark model.

Saved queries are accessible through:

```http
GET /api/queries/bookmarks
```

---

# Solution Finalization Engine

Automated solution resolution is implemented in `solutionService.js`.

## Finalization Trigger

The engine runs:

* Daily through cron scheduling.
* Manually through an administrative endpoint.

---

## Eligibility Rules

Queries become eligible when:

```text
Status = Answered
Age > 48 Hours
```

---

## Manual Resolution Path

If a query already contains an accepted answer:

1. Accepted answer retained.
2. High-quality answers retained.
3. Excess answers pruned.
4. Query marked Resolved.
5. Reputation awarded.

---

## Automatic Resolution Path

If no accepted answer exists after 48 hours:

1. Highest-voted answer selected.
2. Answer marked accepted.
3. Query resolved automatically.
4. No reputation awarded.

---

## Answer Pruning

To keep resolved discussions concise:

* Accepted answers are retained.
* High-value answers are retained.
* Remaining answers may be soft-deleted.

A maximum of three answers are preserved.

---

## Audit Logging

Every finalization event creates an audit record.

Stored information includes:

* Query identifier
* Resolution action
* Timestamp
* System activity metadata

---

# Frontend Responsibilities

| Component       | Responsibility                                                                 |
| --------------- | ------------------------------------------------------------------------------ |
| AskQuery.jsx    | Query submission, attachments, grammar correction, duplicate warnings          |
| QueryList.jsx   | Search, filtering, pagination, query discovery                                 |
| QueryDetail.jsx | Full thread view, voting, bookmarking, answers, comments, resolution workflows |

---

# Service Layer Responsibilities

| Service          | Responsibility                                                        |
| ---------------- | --------------------------------------------------------------------- |
| queryService     | Query lifecycle, validation, duplicate detection, voting, bookmarking |
| answerService    | Answer management, comments, helpful workflow, verification           |
| solutionService  | Automatic solution finalization and cron execution                    |
| gibberishService | Content quality validation                                            |
| spamService      | Spam penalty enforcement                                              |
| vectorService    | Semantic similarity search and duplicate detection                    |

---

# API Summary

| Method | Endpoint                                   | Purpose             |
| ------ | ------------------------------------------ | ------------------- |
| POST   | /api/queries                               | Create query        |
| GET    | /api/queries                               | List queries        |
| GET    | /api/queries/search                        | Hybrid search       |
| GET    | /api/queries/:id                           | Query details       |
| POST   | /api/queries/:id/vote                      | Vote on query       |
| POST   | /api/queries/:id/save                      | Save query          |
| POST   | /api/queries/:id/answers                   | Create answer       |
| POST   | /api/answers/:id/vote                      | Vote on answer      |
| POST   | /api/answers/:id/comments                  | Create comment      |
| POST   | /api/queries/:id/answers/:answerId/helpful | Mark helpful        |
| POST   | /api/admin/answers/:id/verify              | Verify answer       |
| POST   | /api/jobs/solution-finalization/run        | Manual finalization |

---

# End-to-End Workflow

1. User opens AskQuery page.
2. Categories and tags are loaded from taxonomy endpoints.
3. User submits a query with required metadata and optional attachments.
4. Query passes taxonomy validation.
5. Query passes gibberish detection.
6. Spam penalties are applied if validation fails.
7. Embeddings are generated.
8. Duplicate detection is performed.
9. Query is stored.
10. Community members submit answers.
11. Eligible users participate in threaded comments.
12. Answers receive votes.
13. Users bookmark useful discussions.
14. Query author marks an answer as helpful, or the automated finalization engine resolves the query after 48 hours.
15. Query status becomes Resolved.
16. Audit logs and notifications are generated.

---

# Conclusion

The Ask a Query & Forum Engine combines structured query submission, taxonomy-based organization, AI-assisted content validation, semantic duplicate detection, community-driven answering, voting, bookmarking, and automated solution finalization. The module ensures that discussions remain searchable, moderated, and resolution-oriented while maintaining data integrity through validation, soft deletion, audit logging, and controlled workflow transitions.