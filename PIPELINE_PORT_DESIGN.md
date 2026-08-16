# Porting vuln-pipeline to EatHub (Express/SQLite) — design notes

Pre-work for running `/customize` in `defending-code-reference-harness`. The
goal is to have concrete answers ready for the interview: what the detector
is, what a PoC file looks like, what the runner does, and which parts of the
harness actually have to change.

Every claim below is checked against source, and the ones marked **verified**
were executed. Where a claim contradicts `TRIAGE.json`, the contradiction is
stated and resolved explicitly — see §0.

---

## 0. Revision history, and one rule that came out of it

**Draft 1** described the pipeline as shelling out to `binary_path <input_file>`
and reading its exit code. It does not — see §1.

**Draft 2** fixed that, correctly demoted the SQLi/`dbDel` findings as
unreachable, and then made the *same class of error in the opposite direction*:
it promoted two findings to flagship focus areas without checking them, and
both were already-refuted false positives in `TRIAGE.json`:

- a `handlelike` "SQLite type confusion" that does not exist (`TRIAGE.json`
  **f011** had refuted it, 3/3 verifier agreement) — §3.2
- a `generateRecipeId` collision bug that is neither expressible nor a
  security finding (**f009**) — §3.2

Draft 2's own §5 example PoC was built on the first of these and would have
fired the integrity oracle **on correct application behaviour**, then been
copied verbatim into the find prompt as the canonical example.

**The rule, which now governs §3:** reachability triage cuts both ways. A
finding being *absent* from the static pass is not evidence it is real, and a
finding the static pass *refuted* may not be resurrected without engaging that
verdict on the evidence. Every row in §3.2 now cites what was executed to
confirm it, or names the `TRIAGE.json` finding it defers to.

**Draft 3** also corrected four errors that would have stopped the port dead at
build or first patch: the agent image discards the target's Node runtime
(§8.1), `npm ci` cannot run at T0 (§8.2), the runner's own output breaks the
test suite (§8.3), and the flagship bug needs a schema primitive draft 2 did
not have (§5.2).

**Draft 4** (this one) fixes three regressions that draft 3's *own fixes*
introduced — a category worth naming, because each was a correct fix to a real
problem that broke something else:

- `PORT=0` cannot work: the app logs the port *variable*, not the bound port
  (§6.1). Draft 2's fixed port at least ran.
- the temp-dir-per-replay isolation moved `__dirname` and so defeated the
  SPA-shell stub that draft 3 had just placed correctly (§6.2).
- `build_command`'s `git ls-files` loop exits 0 having checked **nothing**,
  because the T0 container has no git repo — strictly worse than the
  `node --check index.js` it replaced (§8.2).

It also corrects an honesty failure in §3.3: draft 3 claimed `HANG` covered the
ReDoS finding without timing the regex. Measured, it is 0.26 ms at the
body-size cap. That is §0's rule being broken in the one section whose entire
job is honest accounting, so the coverage table now carries measurements rather
than assertions.

---

## 1. What the harness contract actually is

The important correction first, because the whole port design hangs off it.

**The pipeline never executes `binary_path`.** It appears in `config.py:27,62`,
`find.py:54`, `report.py:77`, `recon.py:42`, `patch.py:83`, `cli.py:988`, and
`harness/prompts/*.py` — every one of those is either a dataclass field, a
pass-through into a prompt builder, a relative-path computation, or a print.
Nothing execs it. It is a *string interpolated into agent prompts*: "the entry
point is here, go run it." The find agent runs the binary itself, inside its
own container, via its own `Bash` tool.

What actually crosses the find→grade trust boundary is a `CrashArtifact`
(`harness/artifacts.py`):

| field | how it is produced | how it is consumed |
|---|---|---|
| `poc_bytes` | `docker_ops.read_file(container, poc_path)` — read out of the find container | written to `/tmp/poc.bin` in the fresh grade container |
| `reproduction_command` | the agent's `<reproduction_command>` tag | path-substituted (`poc_path` → `/tmp/poc.bin`) and handed to the grader; **executed programmatically at patch T1** |
| `crash_output` | the agent's `<crash_output>` tag, truncated to 10 000 chars (`find.py:96`) | dedup signatures, `found_bugs.jsonl` excerpts, report input |
| `crash_type`, `exit_code` | agent tags | shown to the grader inside an `<untrusted_data>` block |
| `dup_check` | agent tag | required; submission rejected without it (`cli.py:302`) |

Three hard invariants worth designing around:

- `grade.py:45-49` raises if `crash.poc_path` is not a substring of
  `crash.reproduction_command`. The agent's repro command must literally
  contain the PoC path, so it can be rewritten.
- `find.py:87-89` returns `None` if `poc_bytes` is empty — an agent that
  narrates a file it never wrote is dropped.
- **The PoC is always renamed to `/tmp/poc.bin`** outside the find container
  (`grade.py:55-56`, `patch_grade.py:149-151`). So what actually runs in the
  grade and T1 containers is `node /work/run_poc.js /tmp/poc.bin` — a JSON file
  with a `.bin` name. **The runner must never infer format from the extension.**

**Grading is agent judgment, not an exit code.** `grade.py` parses
`<criterion_1..5>`, `<overall>`, `<score>` out of the grader agent's text. The
grader is *told* to run the repro three times and fail below 2/3, but nothing
in Python enforces it. The 3/3 reproduction requirement is a prompt contract,
which means per-replay determinism is enforced socially, not mechanically —
one more reason the runner's reset must be airtight (§6).

**There is exactly one hardcoded ASAN oracle in executable code:**

```python
# harness/patch_grade.py:244
def _t1_passes(rc: int, stdout: str, stderr: str) -> bool:
    return rc == 0 and "AddressSanitizer:" not in (stdout + stderr)
```

T0 (`git apply` + `build_command`), T1 (run the adapted repro command), and T2
(`test_command`) run through `docker_ops.exec_sh` — these *are* real
programmatic execution, and T1 is the line the port must rewrite.

### 1.1 Consequences

1. **The runner matters — just not because "the pipeline calls it."** It matters
   because (a) all four agent types run it by hand, (b) it is executed verbatim
   at patch T1, and (c) it is the only thing standing between the find agent and
   a non-reproducible submission.
2. **`crash_output` is free-form.** Nothing parses it before `asan.py` does, so
   the `<<<DETECTION>>>` block can be any shape `detection.py` can read back.
3. **`asan.py` degrades silently rather than erroring**, and the *precise*
   degradation is why `detection.py` is mandatory:
   - `top_frame()` → `[]`. But `dedup.py:29-33` is
     `crash_type = reason["crash_type"] or crash.get("crash_type") or "unknown"`,
     and `crash_reason` returns `{"crash_type": None}` for non-ASAN text — so it
     falls through to *the agent's own `<crash_type>` tag*, which here is the
     `detector` string. You get **one bucket per claimed detector class**, not
     one global bucket. That is worse than a visible failure: dedup will look
     like it is working while doing nothing finer than grouping by the agent's
     own label.
   - `asan_excerpt()` falls through to "first three non-empty lines," which is
     what lands in `found_bugs.jsonl` — the channel parallel find agents read
     for runtime dup-checking. Garbage there degrades every concurrent run.

---

## 2. Target profile — what is actually in this repo

- **Stack**: Express 4, one Node process, `passport` (local + Google OAuth2),
  `express-session` with an `express-sqlite3` store. `package-lock.json` present,
  so `npm ci` works.
- **Node ≥ 22.12 is a hard requirement.** `routes/recipe.js:10` does
  `require('../shared/ingredients.mjs')`, and that file is pure ESM. `require()`
  of ESM is unflagged only on Node ≥22.12 / ≥20.19. On Node 18 the app throws
  `ERR_REQUIRE_ESM` at module load and never listens. This collides with the
  agent base image — see §8.1, it is a blocker.
- **Storage**: SQLite. `db.js:10` opens `path.join(__dirname,'data','main.db')`
  (absolute); `session_config.js:7` opens `'./data/main.db'` (**cwd-relative**,
  and `express-sqlite3`'s `storedb.js:47` does `join(this.dir='.', this.db)`).
  `file_uploud.js:6` is cwd-relative too. They are the same file *only when the
  process cwd is the app root* — otherwise the session store silently lands in a
  second database and every "reset" leaks sessions across replays. §6.1 handles
  this by giving each replay its own app root.
- **The app self-starts.** `index.js:84` calls `app.listen()` at module scope
  and exports nothing — no way to `require()` it and hold a server handle. It
  must be spawned as a child process. Port from `process.env.PORT` (`:83`).
- **Login is by `email`, not `username`.** `local_strategy.js:13` sets
  `usernameField: "email"`. A login body with `username` yields
  `Missing credentials`. `local_strategy.js:30` also refuses login when
  `!user.email_verified` — so the seed's `email_verified = 1` is load-bearing,
  not cosmetic.
- **Two named error log lines, both pino JSON on stdout**: `'unhandled error'`
  (`index.js:70`) and `'unhandled promise rejection'` (`index.js:80`).
  `logger.js` uses `pino.stdSerializers.err`, so `err.stack`, `err.code` and
  `err.statusCode` ride along.
- **There is no `uncaughtException` handler** — only `unhandledRejection`
  (`index.js:79`). A synchronous throw outside request handling takes the
  process down, so child exit during replay is its own signal.
- **The verification-link fallback is `console.log`, not pino** (`mailer.js:41`,
  deliberately — see the comment there). Any oracle reading it must scan plain
  text lines, not JSON.
- **Unconfigured integrations degrade instead of failing** (`.env.example`).
  **Verified**: with `GOOGLE_CLIENT_ID`, `SMTP_HOST`, `GEMINI_API_KEY` and
  `SESSION_SECRET` all unset, the app boots, logs a `warn` per integration, and
  serves `GET /api/recipes` → 200.
- **`npm test` is `node --test`.** **Verified: 22/22 pass, exit 0, ~1s on a
  clean tree.** T2 is a real gate — but see §8.3, the runner file breaks it.

## 3. Reachability triage

An execution-verified pipeline can only produce PoCs for defects reachable from
the HTTP surface. Anchoring focus areas on anything else burns agent turns and,
worse, invites the agent to submit something that looks like a hit.

### 3.1 Not reachable — keep out of the oracle set and name as out-of-scope

| Finding | Why not | Evidence |
|---|---|---|
| `dbDel` two-column branch runs `SELECT` instead of `DELETE` | **Dead code.** Zero callers. | Only its definition (`db.js:640`) and export (`:659`). Both delete routes use `dbDeleteRecipe`/`dbDeleteComment`, which do their own parameterised single-column `DELETE` *and* check ownership first. |
| SQLi via interpolated table/column/`LIMIT` | **No user-controlled path.** | Every call site passes string *literals* for table and column; no caller anywhere passes `column2`/`value2`; `limit` is only ever `1` or `'all'`, both from code. Values are parameterised throughout. Matches `TRIAGE.json` f008/f012. |
| Open redirect via `safeNext` | **Sink is dead even with Google configured.** | The bypass (`/\evil.com` — starts with `/`, not `//`) is real, but `user.js:152` calls `req.login` with no options, so passport 0.6.0 regenerates the session and `req.session.returnTo` (set at `:137`) is gone before `:157` reads it. `safeNext(undefined)` → `'/'`. Per `TRIAGE.json` f010. **Draft 2 said "unreachable because Google is unconfigured" — that was the wrong reason, and it matters: a Google stub would not make this reachable.** |
| `SESSION_SECRET` dev fallback → cookie forgery | **Store is server-side.** | Minting a correctly-signed `connect.sid` gains nothing: `express-sqlite3`'s `get()` does `SELECT sess FROM sessions WHERE sid = ?` and returns `undefined` for a fabricated sid, so express-session hands back a fresh *anonymous* session. `saveUninitialized: false` means no row pre-exists. Per `TRIAGE.json` f003. The hardening finding stands; it just has no PoC. |
| `generateRecipeId` = `parseInt(uuid(),16)` collisions | **Not a security finding, and not expressible.** | `recipes.recipe_id` is `INTEGER PRIMARY KEY` (`db.js:29`) so a collision fails the INSERT — there is no shared-id state to observe. And at 32 bits the birthday bound is ~65 536 multipart uploads *per replay*, ×3 for grading. Per `TRIAGE.json` f009 ("file it as robustness"). |

### 3.2 Reachable and confirmed by execution

**Flagship — `handlelike` check-then-act race (`db.js:140-201`, route
`recipe.js:260`).** No transaction wraps the `SELECT`-then-`INSERT`, and the
`ranking` counter is updated by a separate read-modify-write (`dbUpdate` with
`'+1'`/`'-1'`). Concurrent requests interleave freely.

**Verified** — 20 concurrent `handlelike(recipe, bob, 1)` calls:

```
likes rows for (bob, recipe): 20      # toggle semantics allow at most 1
ranking:  [{recipe_id:100, likes:20, dislikes:0, views:0}]
```

Twenty duplicate vote rows for one user on one recipe. The reviewer's
independent run of the same race through HTTP produced 7 rows and
`likes: -5` — a *negative* counter. Different interleavings, same defect. The
variance matters for design: this is probabilistic, so the 3/3 reproduction
contract requires a repeat count high enough to make drift near-certain. **20
reproduced in both observations; the floor is unmeasured.** Settling it is
cheap — run the race at 2, 5, 10, 20 and record the smallest repeat that drifts
3/3 — and the number belongs in the find prompt regardless, since it is the
knob agents will reach for first.

The always-on invariant it violates is schema-independent and always true in
correct operation:

```sql
SELECT recipe_id, user_id, COUNT(*) c FROM likes
GROUP BY recipe_id, user_id HAVING c > 1;   -- must be empty
```

**Host-header injection into verification links.** `baseUrl()` (`user.js:19`) is
`PUBLIC_URL || `${req.protocol}://${req.get('host')}``. The shortest path is
**`POST /api/signup`**, which calls `baseUrl(req)` directly at `user.js:53`.
(`/api/resend-verification` also reaches it, but `user.js:122` gates on
`!user.email_verified`, so it no-ops against a verified seed user — the seed
needs an unverified third user for that path.) With `SMTP_HOST` unset the link
is printed to stdout. Verified live: `Host: attacker.test` on signup yields
`http://attacker.test/verify-email?token=…` on the console.

**Malformed JSON body → 500 (expect this to be the first find on every run).**
`index.js:68-75` returns 500 unconditionally, ignoring the `err.status` /
`err.statusCode` that body-parser sets to 400:

```
$ curl -X POST /api/login -H 'Content-Type: application/json' -d '{bad json'   → 500
msg='unhandled error'  err.type=SyntaxError  err.status=400
msg='request'          status=500
```

A genuine (LOW) defect — a 4xx reported as 5xx — and firing on it is
defensible. But it is unauthenticated, one request, zero setup, and it trips
two classes at once, so the find agent will land it within a couple of turns on
*every* run, long before it reaches the flagship race. **Ship it as a
`known_bugs` entry** (§7 now carries it, and this is exactly what the
field is for) so agents see it as already-known rather than resubmitting it.
Deciding this now is the difference between a known first find and something
that looks like oracle noise on every single run.

**CORS reflects any origin with credentials.** `index.js:43-44` passes
`origin: clientUrl || true, credentials: true`, and `clientUrl` is `''` by
default (`index.js:22`), so `cors` takes the reflect-the-request-origin branch.
One request, one header comparison — the cheapest oracle in the set, firing on
real MEDIUM-severity behaviour (`TRIAGE.json` f006).

**Upload content-type confusion** (`file_uploud.js`). `fileFilter` checks the
client-supplied `mimetype`; the stored filename is `<serverRecipeId><ext>` with
`ext` from the client. No traversal is possible (`path.extname` cannot return a
separator, and the read route applies `path.basename`), so this is
content-type confusion, not path escape. `TRIAGE.json` f002 rates it HIGH — the
top-severity true positive. See §4 for how it is covered.

### 3.3 Coverage against the triaged true positives

| `TRIAGE.json` | sev | v1 oracle coverage |
|---|---|---|
| f002 upload content-type confusion | HIGH | `UNSAFE_CONTENT_TYPE` (PoC-triggered) |
| f001 Google account-takeover via email linking | HIGH | **not covered** — needs the OAuth stub (§10) |
| f004 OAuth missing `state` | MED | **not covered** — needs the OAuth stub |
| f006 CORS reflects any origin | MED | `CORS_POLICY_VIOLATION` |
| f005 Host-header verification links | MED | `ORIGIN_ESCAPE` |
| f003 `SESSION_SECRET` fallback | MED | out of scope, §3.1 — hardening, no PoC |
| f013 unbounded email regex (ReDoS) | LOW | **not covered — measured non-issue** |

**Honest count: 3 of 7** — f002, f005, f006. Not covered: f001 and f004 need
the OAuth stub (§10); f003 is a hardening finding with no PoC (§3.1); f013 is a
measured non-issue (below).

Two caveats on the three that are covered. All three are **PoC-triggered**
(§4), not free: f005 and f006 need an attacker-supplied `Host` / `Origin`, and
f002 needs a deliberately mismatched upload. f006 alone can be promoted to
always-on via the `OPTIONS` probe in §4. So "3 of 7" is the ceiling if the
agent does the right thing, not a floor — which is the honest way to read it,
and why the find prompt must name all three tricks explicitly (§8.4 item 3).

(Draft 3 claimed 5/7; draft 4 claimed "2 today, 4 after headers." Both were
wrong — the second was arithmetic that never enumerated the seven rows.)

On f013: `looksLikeEmail`'s regex (`user.js:23`) is
`/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — no nested quantifiers, no alternation, so no
catastrophic backtracking. **Measured** against the worst case (`a…a@b…b`, no
dot, forcing the trailing `[^\s@]+\.` to fail at every position):

```
len 1000   no-@: 0.05ms   @-no-dot: 0.00ms
len 10000  no-@: 0.03ms   @-no-dot: 0.03ms
len 50000  no-@: 0.09ms   @-no-dot: 0.12ms
len 100000 no-@: 0.18ms   @-no-dot: 0.26ms
```

0.26 ms at the 100 kB body-parser cap. No timeout budget would ever fire on it.
`TRIAGE.json` f013 is flagged `needs_manual_test` with the note *"a human
should settle it by timing the regex against a 100 kB crafted input"* — that is
now settled, and the answer is no. The length cap is still worth adding as
free hardening; it is just not a pipeline target.

Stating this table in the target README is worth the two minutes: it is the
honest answer to "did the pipeline find everything?", and it makes the OAuth
stub decision (§10) a quantified one — it is what unblocks both HIGH findings
that v1 misses.

## 4. Detection signal — the oracle table

The runner evaluates every **always-on** oracle after every replay, regardless
of which one the PoC claims to target — mirroring the grade agent
independently re-deriving the ASAN signature instead of trusting the find
agent's self-report. PoC-**declared** invariants run only when present.

One distinction draft 3 blurred by calling everything "universal": an oracle
being always-*evaluated* is not the same as always-*triggerable*. **Three**
classes below can only fire if the PoC cooperates — two by sending a particular
header, one by uploading a deliberately mismatched file — which reads very
differently from "you get this for free."

| Class | Kind | Fires when | Evidence source |
|---|---|---|---|
| `DATA_INTEGRITY_VIOLATION` | always-on + declared | **Always-on:** any `(recipe_id,user_id)` pair with >1 row in `likes`; `ranking.likes` ≠ `COUNT(likes WHERE rating=1)` (same for dislikes); any negative counter in `ranking`. **Declared:** any PoC `invariants[]` entry whose expectation fails. | Read-only SQLite handle, queried after replay. |
| `CROSS_ACCOUNT_ACCESS` | always-on | A 2xx response under session B reads or mutates a row whose `user_id` is A's, with no legitimate grant. **No known instance** — the ownership checks at `db.js:270` and `db.js:375` are correct. Retained as a safety net because the query is nearly free. | HTTP status/body + ownership query. Alias→`user_id` comes free from the session store: `SELECT sess FROM sessions WHERE sid = ?` on the alias's `connect.sid`, then read `passport.user` out of the JSON. |
| `UNCAUGHT_EXCEPTION` | always-on | A pino line with `msg: "unhandled error"` or `"unhandled promise rejection"` on stdout during the replay window, **excluding the SPA-shell allowlist** (§6.2), or the child exits before teardown. | Captured child stdout + child exit status. |
| `UNEXPECTED_5XX` | always-on | Any request in the replay returns 5xx, excluding the SPA-shell allowlist — **correlated by `reqId`**, see below. | Scan for `level:50 && msg:"request" && status>=500`, then **suppress any whose `reqId` matches an allowlisted `'unhandled error'` line**. |
| `INFO_DISCLOSURE` | always-on | A response body carries a stack trace, a SQLite driver error string, or a password-hash / token field. | Response-body pattern match. |
| `UNSAFE_CONTENT_TYPE` | **PoC-triggered** | A file stored via upload is later served with a `Content-Type` that does not match its actual magic bytes, or with an active type (`text/html`, `image/svg+xml`, `application/javascript`). Requires the PoC to upload a file whose declared type and bytes disagree — a legitimate `.png` produces nothing, and **no post-hoc probe can promote this**, because nothing after the replay can retroactively create a mismatched upload. | Upload response + a follow-up GET of the stored file. |
| `HANG` | always-on | Total replay wall-clock exceeds the budget, or any single request exceeds its own timeout. | Runner's own clock. Exit 3, **and a detection block is still emitted** (§6.3). |
| `CORS_POLICY_VIOLATION` | **PoC-triggered** | A response carries `Access-Control-Allow-Origin` echoing an attacker-supplied `Origin` together with `Access-Control-Allow-Credentials: true`. Requires the PoC to send `Origin`. | Response headers. |
| `ORIGIN_ESCAPE` | **PoC-triggered** | A `Location` header, or a verification link captured from stdout, resolves outside the app origin / `CLIENT_URL`. Requires the PoC to send a hostile `Host`. | Response headers + plain-text stdout scan (the link is `console.log`, not JSON — §2). |

**`UNEXPECTED_5XX` must correlate by `reqId`, or it reopens the SPA-shell trap
through a different door.** The §6.2 allowlist keys on `err.code === 'ENOENT'`
and `err.path` — and the `msg:"request"` line carries **no `err` object at
all**, so a naive `status>=500` scan fires on a bare `GET /` against a healthy
app. The two lines of a pair share a `reqId` (`index.js:69`'s own comment says
so: *"req.log carries the reqId, so this line can be matched to its request"*),
which is the join key. Verified on a run doing `GET /` plus one FK-rejected
like:

```
msg='unhandled error'            reqId=54fd6eef  err.code=ENOENT  → allowlisted
msg='request'  status=500        reqId=54fd6eef                   → suppressed
msg='could not record the vote'  reqId=678cdbe1  err.code=None
msg='request'  status=500        reqId=678cdbe1                   → FIRES
```

The second pair is the proof the rule discriminates rather than just silencing:
the FK-500 has no `unhandled error` sibling, so focus area #2 stays detectable.

### Multiple classes, and which one is *the* class

Several classes routinely fire from one event — a malformed JSON body trips
`UNCAUGHT_EXCEPTION` + `UNEXPECTED_5XX`; the §5.1 example trips
`DATA_INTEGRITY_VIOLATION` + `ORIGIN_ESCAPE` + `CORS_POLICY_VIOLATION`. Left
unordered that breaks two things: `signature()` (§8.4 item 1) takes one class,
so two runs emitting the same set in different order would key differently —
the exact fragility §1.1 warns about, arriving through the new schema instead
of through `asan.py` — and the grade criterion "the same class ≥2/3" is
meaningless against a set whose membership can vary between replays (§5.2
point 4 makes non-2xx inside a `parallel` block transcript data, so a race may
or may not produce a 500 on any given run).

**Fixed precedence, highest first:**

```
DATA_INTEGRITY_VIOLATION > CROSS_ACCOUNT_ACCESS > ORIGIN_ESCAPE >
CORS_POLICY_VIOLATION > UNSAFE_CONTENT_TYPE > INFO_DISCLOSURE >
UNCAUGHT_EXCEPTION > UNEXPECTED_5XX > HANG
```

The runner emits `classes` sorted by it and adds a `primary_class` key
(§6.3) so `detection.py` never re-derives the ordering. `signature()` keys on
`primary_class`; the grade criterion reads "the same **primary** class ≥2/3."

**Optional promotion:** `CORS_POLICY_VIOLATION` can be made genuinely always-on
for the cost of one extra request — after each replay the runner issues its own
`OPTIONS /api/profile` with `Origin: https://attacker.test` and checks the
response headers. Recommended: it removes the only interesting class that
depends on the agent thinking to set a header.

The **total-replay budget is 120 s** and the **per-request budget 15 s**. Both
must stay comfortably under `patch_grade.py:154`'s hardcoded `timeout=600`, so
that at T1 the runner's own exit 3 fires first and produces a parseable
detection block instead of a bare `TimeoutExpired` with rc=-1.

Dropped from draft 2: `AUTH_BYPASS_SESSION_FORGERY` (§3.1 — no reachable
instance) and `CANARY_PATH_ESCAPE` (no traversal primitive exists). Also
deleted are two draft-2 integrity sub-checks that **cannot fire by schema
construction** — "a `likes` row whose `recipe_id` matches no recipe" is blocked
by the FK, and "two recipes sharing a `recipe_id`" by the PK (§3.2 evidence).

## 5. PoC format — one JSON file

### 5.1 Schema

```json
{
  "detector": "DATA_INTEGRITY_VIOLATION",
  "steps": [
    { "session": "carol", "method": "POST", "path": "/api/signup",
      "headers": { "Host": "attacker.test", "Origin": "https://attacker.test" },
      "body": { "email": "carol2@seed.local", "password": "seed-pw-carol2",
                "username": "carol2" },
      "capture": { "link": { "from": "stdout",
                             "regex": "verification link for [^\\n]*\\n(\\S+)" } } },

    { "session": "alice", "method": "POST", "path": "/api/login",
      "body": { "email": "alice@seed.local", "password": "seed-pw-alice" } },

    { "session": "alice", "method": "POST", "path": "/api/recipes",
      "multipart": {
        "fields": { "name": "Alice's Soup", "info": "x", "recipe": "[]", "ingredients": "[]" },
        "files": [{ "field": "image", "filename": "x.png",
                    "content_type": "image/png", "content_base64": "iVBORw0K..." }]
      },
      "capture": { "recipe_id": { "from": "body", "path": "$.recipe_id" } } },

    { "session": "bob", "method": "POST", "path": "/api/login",
      "body": { "email": "bob@seed.local", "password": "seed-pw-bob" } },

    { "parallel": { "repeat": 20,
        "requests": [ { "session": "bob", "method": "POST",
                        "path": "/api/recipes/${recipe_id}/like",
                        "body": { "like": 1 } } ] } }
  ],
  "invariants": [
    { "sql": "SELECT COUNT(*) FROM email_tokens WHERE user_id = 4",
      "expect": { "equals": 1 } }
  ]
}
```

**`password` must be ≥ 8 characters** (`user.js:39-41` rejects shorter ones with
a 400 before the user is created), or step 0 never emits a verification link and
the `link` capture fails → exit 1. Three consecutive drafts shipped a §5.1
example that could not execute — `username` instead of `email`, then a
tautological invariant, then a 2-character password. It is the exhibit every
agent copies, so §9 now carries a checkbox for running it.

The declared invariant here deliberately asserts something the always-on set
has no vocabulary for — that the signup in step 0 produced exactly one
`email_tokens` row. An earlier revision asserted `ranking.dislikes = 0` after a
like-only race, which is a **tautology**: `handlelike` only touches `dislikes`
in its "change" branch (`db.js:177`), which 20 identical `like: 1` requests
never reach, so it reads 0 whether or not the bug exists. A declared invariant
that cannot fail teaches the agent the wrong lesson about what the field is for.

### 5.2 Why each construct exists

- **`parallel` is mandatory, not a nicety.** The flagship bug (§3.2) is a
  check-then-act race; a strictly sequential request list *cannot express it*.
  Draft 2's schema had no concurrency primitive, which meant the oracle class it
  called flagship had no expressible PoC. `repeat` also gives the agent the knob
  it needs to push a probabilistic bug over the 3/3 reproduction bar.

  **Parallel semantics — specify all six or a builder invents them:**
  1. `requests` is a **list**, fired concurrently, and `repeat` multiplies the
     whole list. A singular `request` could only race N copies of one call; a
     list also expresses heterogeneous races such as `DELETE /api/recipes/:id`
     against `POST /api/recipes/:id/like`, which is the next check-then-act
     defect in the same file.
  2. `${var}` is resolved **once, before the block starts** — not per iteration.
  3. `capture` inside a `parallel` block is a **schema error**. With 20 racers
     there is no defensible winner.
  4. A non-2xx or a transport error inside the block is **transcript data, not a
     replay failure**. A race that trips the FK or `SQLITE_BUSY` legitimately
     produces 500s — treating those as exit 1 would make the flagship PoC flaky
     in exactly the way §1 warns about.
  5. The runner **waits for all N to settle** before the next step. Oracle
     evaluation in §6.1 step 5 depends on it.
  6. `trigger_step_index` refers to **the block's index in `steps`**, not to any
     individual racer.

- **`headers`** is a per-step map, and it is load-bearing rather than cosmetic:
  `ORIGIN_ESCAPE` needs a hostile `Host` and `CORS_POLICY_VIOLATION` needs an
  `Origin`, so without it two §4 classes and two §3.3 coverage claims are dead.
  Note `Host` must **override** the HTTP client's automatic value — most clients
  set it themselves, and silently ignoring a user-supplied `Host` is a common
  library default worth testing for in the runner's own smoke test.
- **`session`** is a free-form alias with its own cookie jar, populated from
  `Set-Cookie`. An alias never used in a login stays anonymous on purpose — that
  is how unauthenticated access gets tested.
- **`capture` / `${var}`** are mandatory. `recipe_id` is assigned server-side per
  insert and is not stable across a reset, so nothing downstream of a create can
  be hardcoded. `from` is `"body"` (JSONPath-lite), `"header"`, or **`"stdout"`
  with a regex** — the last is required because `ORIGIN_ESCAPE` reads a
  verification link that only ever appears on the console (§2), which a
  body-only capture cannot reach. Substitution applies to `path`, `body`,
  `multipart.fields`, `headers`, and `invariants[].sql`.

  **`from: "stdout"` matches against the joined buffer, not line by line.** The
  §5.1 capture regex deliberately spans a newline, because `mailer.js:41` prints
  the address and the URL on separate lines. §6.1 step 3's line-splitting serves
  the `UNCAUGHT_EXCEPTION` / `UNEXPECTED_5XX` scans, which are per-line by
  nature; the two coexist and the spec has to say which is which.
- **`multipart`** with base64 content, for `POST /api/recipes` and the
  `UNSAFE_CONTENT_TYPE` class.
- **`cookies`** (per-request, optional) — kept because it is cheap and useful
  for negative tests, *not* because of session forgery, which §3.1 rules out.
- **`detector`** is the agent's claim, advisory only — exactly like
  `<crash_type>`, which `grade.py` files inside `<untrusted_data>`. The runner
  reports what actually fired, and the comparison is against **`primary_class`**
  (§4), not against the whole `classes` set. A mismatch is a note, not a
  reject — the agent may have found something better than it aimed for.
- **`invariants` is a list**, each `{sql, expect}`. Draft 2's single scalar
  equality could not express the cross-table comparisons §4 asks for.

  **The result-shape contract must be stated**, because `expect` mixes two
  different kinds of assertion: `equals` / `not_equals` / `lte` / `gte` compare a
  *value*, while `row_count` describes the *result set*. So: **the SQL must
  return exactly one row of exactly one column, and `expect` is
  `{equals|not_equals|lte|gte: <value>}` — except `{row_count: N}`, which
  asserts on the number of rows and places no constraint on columns. Any other
  shape is a schema error (exit 1).** Without this, §3.2's own always-on
  invariant (a `GROUP BY … HAVING c > 1` that returns *rows*) and §5.1's example
  (a scalar `SELECT`) are two different shapes with no stated rule between them.

### 5.3 SQL safety

Enforce read-only by **opening a second connection with
`sqlite3.OPEN_READONLY`** — one line, enforced by the driver. Do *not* do it
with a `startswith('SELECT')` text check: that invites arguments about
`PRAGMA`, `WITH … SELECT`, statement separators, and comment prefixes, and
loses them.

`${var}` interpolation into SQL is textual. Captured values come from the app's
own responses, so this is not a classic injection surface — but the runner must
still fail cleanly when a capture is missing, rather than letting a literal
`${recipe_id}` reach SQLite and surface as a syntax error (which would become a
confusing exit-1; see §6.3).

## 6. The runner (`run_poc.js`)

Contract: `node /work/run_poc.js <poc-file>`. One argument, no interactive
input, no network beyond loopback, safe under `--network none`. The argument is
**`/tmp/poc.bin`** in every container except the find agent's — parse by
content, never by extension (§1).

### 6.1 Sequence

1. **Isolate.** Copy **`/work` — the app tree *and* its sibling `frontend/`,
   preserving the parent relationship** — to a fresh `mktemp -d`, then `chdir`
   into the copied app root:

   ```sh
   mkdir -p /work/.replays            # mktemp -p does NOT create the parent
   T=$(mktemp -d -p /work/.replays)
   cp -r /work/app "$T/app"; cp -r /work/frontend "$T/frontend"; cd "$T/app"
   ```

   **`-p /work/.replays`, not `/tmp`.** Under gVisor `/tmp` is an in-sandbox
   tmpfs — `docker_ops.py:104-105` says so in its own comment, which is why
   `write_file` uses `docker exec` rather than `docker cp` — so it is
   memory-backed and counts against `--memory` (default `4g`,
   `config.py:35`). At 32 MB a replay, any teardown that does not complete (a
   harness SIGKILL, an exception before the `finally`, a budget expiring
   mid-copy) accumulates, and ~120 leaked replays exhaust the container. It
   would present as unrelated flakiness — OOM-killed Node, half-copied trees —
   not as "disk full." `/work/.replays` is on the writable layer, sits outside
   `source_root` so `git -C /work/app status` stays clean (§8.5), and is never
   walked by `test/no_console.test.js` (rooted at `__dirname/..` = `/work/app`).
   Sweep stale `/work/.replays/*` at runner start so a leak costs disk once
   instead of compounding. The `mkdir -p` is required: `mktemp -p` does not
   create its parent and exits 1 if it is missing (verified), which would fail
   the first replay in a fresh container. Doing it in the runner rather than
   only the Dockerfile also survives `agent_image.ensure`'s `COPY --from`. One
   consequence worth knowing: `patch_grade.py:194` `docker commit`s the whole
   container for the re-attack tier, so a leaked replay dir travels into one
   extra image — harmless, but it is why the sweep runs at start.

   This fixes the "cwd must be the app root" hazard (§2) and makes concurrent
   replays safe (§6.4). **Copying only `/work/app` breaks §6.2** — `index.js:20`
   resolves the SPA shell as `__dirname/../frontend/dist`, so moving the app
   moves the expected stub location with it, and the trap reopens. Measured cost
   of the copy: **~50 ms** (32 MB, 3 532 files), so no hardlink optimisation is
   warranted.
2. **Reset + seed** deterministically inside that copy. Fixed ids and fixed
   bcrypt hashes (generate once, paste the literals in — never hash at runtime,
   bcrypt is deliberately slow and it is per-replay cost):
   - `alice` (user_id 1, `alice@seed.local`, `email_verified = 1`)
   - `bob` (user_id 2, `bob@seed.local`, `email_verified = 1`)
   - `carol` (user_id 3, `carol@seed.local`, **`email_verified = 0`**) — required
     to reach `/api/resend-verification`, which no-ops for verified users (§3.2)
   - one recipe each for alice and bob, one comment, one like, matching `ranking`
     rows.

   `email_verified = 1` on alice and bob is load-bearing: `local_strategy.js:30`
   refuses login without it. Document the fixture in the find prompt so the
   agent references it by name instead of spending turns discovering it.
3. **Spawn** `node index.js` with cwd = the temp app root. **The runner picks
   the port itself** — `net.createServer().listen(0)`, read `address().port`,
   close it, pass that as `PORT`. `GOOGLE_CLIENT_ID`, `SMTP_HOST`,
   `GEMINI_API_KEY` unset; `SESSION_SECRET` pinned. Capture stdout/stderr
   line-by-line. Wait for the listen line with a timeout — never a fixed sleep.

   **Do not pass `PORT=0` and parse the log line.** `index.js:84-85` logs the
   `port` *variable* (`process.env.PORT || 4000`), not `server.address().port`,
   so with `PORT=0` it prints `listening on http://localhost:0` while the OS has
   actually bound something else entirely — verified: the log said `0`, `ss`
   showed the process on `41081`. The runner would connect to port 0 and fail
   every replay. Do **not** patch `index.js` to fix this — it is the target
   under test.

   Reserve-then-release leaves a real TOCTOU window: if replay A reserves and
   releases, B can be handed the same port before A's child binds. The temp dir
   does **not** close this — it isolates the filesystem, not the network
   namespace. Close it by **retrying the reserve-and-spawn on `EADDRINUSE`**, up
   to a small bound. Three lines, and it removes the last source of
   cross-replay flakiness inside a container.
4. **Replay**, honouring `parallel` blocks, per-session cookie jars, `${var}`
   substitution. Record the full transcript. Bound each request and the total
   replay with timeouts (§6.3, exit 3).
5. **Evaluate** every always-on oracle plus any declared invariants (§4),
   against the transcript, the read-only DB handle, captured stdout, and the
   child's exit status.
6. **Emit** the detection block, then **always** tear down in a `finally`
   (SIGTERM, then SIGKILL on a short timer), wait for exit, and remove the temp
   dir. A leaked process is how a 3/3 requirement quietly becomes a flaky 2/3.

Note on the reset: delete `main.db` **and** `main.db-wal` / `-shm` defensively.
Draft 2 justified this by "the store enables WAL via `concurentDb: true`" — that
is false. `express-sqlite3` has an upstream typo: `storedb.js:13` accepts the
option as `concurentDb` (one `r`) but `:68` reads `this.concurrentDb` (two), so
it is permanently `undefined` and WAL never engages. The *action* is still
right; the reason was wrong. A real consequence of no-WAL: the app and session
store hold two connections to one file and contend on the writer lock, which is
a plausible flakiness source under load.

### 6.2 The SPA-shell trap

`index.js:62` serves `app.get('*')` from
`path.join(__dirname,'..','frontend','dist','index.html')`. **That directory
does not exist** — `../frontend` is a sibling repo, built separately.
`res.sendFile` on a missing file calls `next(err)` → error middleware → an
`'unhandled error'` log line.

**Verified.** With every integration unset: `GET /api/recipes` → 200, and
`GET /` → 500 with:

```json
{"level":50,"reqId":"a7ba3f36-…","msg":"unhandled error",
 "err":{"type":"Error","code":"ENOENT","syscall":"stat","statusCode":404,
        "message":"ENOENT: no such file or directory, stat '…/frontend/dist/index.html'"}}
```

So a bare `GET /` fires `UNCAUGHT_EXCEPTION` on a completely healthy app. Left
alone that is not a nuisance — the find agent will hit it within a few turns,
submit it, and it will reproduce 3/3 in grading. The pipeline would confidently
verify a non-bug.

Both `err.code` and `err.statusCode` are present in the serialised error, which
makes the filter exact rather than heuristic. Two fixes; do the first, keep the
second as defence in depth:

- Ship a minimal `index.html` at the SPA-shell path. **It must land at
  `/work/frontend/dist/index.html`, not inside the app dir** — `index.js:20`
  resolves `__dirname/../frontend/dist`, so with the app at `/work/app` the
  stub belongs one level up. Draft 2 said "in the image" without a path, which
  under its own `source_root: /work` layout would have put it outside the
  copied tree and left the trap live (§8.1). **And because the stub is located
  relative to `__dirname`, §6.1 step 1 must copy `frontend/` alongside the app**
  — otherwise the isolation fix silently reopens this exact trap.
- Filter `'unhandled error'` lines whose `err.code === 'ENOENT'` *and* whose
  `err.path` is the SPA shell.

This generalises into a build rule: **before trusting any oracle, replay a
known-benign PoC against the unmodified app and confirm nothing fires.** That
negative control ships as a fixture (§8.4).

### 6.3 Output and exit codes

```
<<<DETECTION>>>
{
  "fired": true,
  "primary_class": "DATA_INTEGRITY_VIOLATION",
  "classes": ["DATA_INTEGRITY_VIOLATION", "UNEXPECTED_5XX"],
  "trigger_step_index": 3,
  "evidence": {
    "always_on": { "duplicate_like_rows": [{"recipe_id":7,"user_id":2,"count":14}],
                   "ranking_drift": {"recipe_id":7,"ranking_likes":-3,"actual_rows":14} },
    "http": { "status": 200, "body": { "action": "add" } }
  }
}
<<<END DETECTION>>>
```

| exit | meaning |
|---|---|
| `0` | replay completed, no oracle fired |
| `1` | runner/infra error — malformed PoC, schema error, reset failed, app never came up, missing capture |
| `2` | a **non-hang** oracle fired |
| `3` | **hang** — replay or a single request exceeded its budget. A `HANG` detection block is still written to stdout before exiting. |

Splitting 2 from 3 matters because `HANG` is itself one of §4's oracle classes,
so "one or more oracles fired" would otherwise be true for both. Emitting the
detection block on the hang path is not optional: without it `detection.py` gets
nothing, `crash_output` is empty, dedup falls back to the agent's own label
(§1.1), and the judge sees a blank excerpt.

The ported T1 oracle:

```python
def _t1_passes(rc: int, stdout: str, stderr: str) -> bool:
    return rc == 0
```

Three deliberate choices here, all corrections to draft 2:

- **No string check.** Draft 2 proposed `'"fired": true' not in stdout`, which
  matches only the pretty-printed form; `JSON.stringify({fired:true})` emits
  `{"fired":true}` with no space and the guard silently never matches. Exit code
  2 already carries the signal, so the string check adds only a failure mode.
- **No explicit `rc == 1` branch.** Draft 2 added one; it was a no-op, since
  `return rc == 0` already yields `False` for 1. (`tests/test_patch_grade.py:146`
  asserts exactly this today.)
- **But the infra/hang distinction must still be carried**, and `_t1_passes`
  cannot carry it. `patch.py:172-181` `_failed_tier` maps `not t1_poc_stops` to
  the literal string `"t1 (PoC still crashes)"` and feeds it back as
  `retry_evidence` into the next patch prompt. `PatchVerdict`
  (`artifacts.py:65-101`) has **no field for "the harness broke"**. So a patch
  that legitimately changes a response shape breaks the PoC's `capture`, the
  runner exits 1, and the patch agent spends all five iterations being told its
  fix did not work. Fix: add `PatchVerdict.ladder_error: str | None`, set it in
  `patch_grade.py` **on rc=1 only**, and branch on it in `_failed_tier`. That
  puts `patch.py` and `artifacts.py` on the change list (§8.5).

  **rc=3 is not a ladder error.** A hang at T1 means the replay ran and blew its
  budget — either the original bug was a hang and the fix did not take, or the
  patch *introduced* one (a botched loop bound, a lock held across an await —
  exactly what `patch_grade.py:160`'s own timeout message warns about). Both are
  genuine patch failures. Labelling rc=3 as infra would tell the agent "ignore
  this, the harness broke" about a regression it just caused. Give it its own
  `_failed_tier` string — `"t1 (replay hung)"` — carrying the runner's timing
  evidence.

### 6.4 Concurrency

Draft 2 pinned a fixed port and a shared `data/main.db`, then noted that
determinism is only socially enforced — which is exactly the combination that
breaks. The grade prompt tells the grader to run the repro three times, and any
find agent optimising its loop may background several replays. Each would
delete and reseed the same database and bind the same port: `EADDRINUSE`,
half-seeded state, non-reproducible verdicts.

§6.1's temp-dir-per-replay removes the **filesystem** collision, which is why
it is step 1 rather than a footnote; runner-side port reservation with an
`EADDRINUSE` retry (§6.1 step 3) closes the **port** collision. The temp dir
does nothing for the port — it is not a network namespace — so both mechanisms
are needed. As a belt-and-braces alternative,
take an exclusive lock and serialise — but isolation is better than
serialisation here, because it keeps three graded replays genuinely independent
rather than merely ordered.

Worth stating explicitly so a reader worries about the right thing: **across**
parallel find agents there is no collision, because `sandbox.agent_container`
gives every run its own container. The hazard is only *within* one container.

## 7. Proposed `config.yaml`

```yaml
image_tag: vuln-pipeline-eathub:latest
github_url: "(local target — EatHub Express API)"
commit: "n/a"
binary_path: /work/run_poc.js
source_root: /work/app
build_command: >-
  cd /work/app && git rev-parse --git-dir >/dev/null 2>&1
  || { echo 'FATAL: /work/app is not a git repo — see design §8.2' >&2; exit 1; };
  git ls-files -z --cached --others --exclude-standard '*.js' '*.mjs'
  | xargs -0 -n1 -r node --check
test_command: cd /work/app && npm test
focus_areas:
  - "Like/ranking integrity — handlelike() is check-then-act with no transaction and a read-modify-write counter; concurrent votes duplicate rows and desync ranking (db.js:140-201, recipe.js:260)"
  - "handlelike error paths — a nonexistent recipe id reaches the INSERT and surfaces the FK rejection as a 500 rather than a 404 (db.js:186-196, recipe.js:260)"
  - "Request-controlled absolute URLs — baseUrl() builds verification links from the Host header (user.js:19, reached from /api/signup at :53)"
  - "CORS and upload handling — reflected origin with credentials (index.js:43), client-supplied mimetype and extension on stored files (file_uploud.js)"
attack_surface: |
  Express 4 JSON API ("EatHub", recipe sharing) behind express-session with a
  SQLite store colocated with application data, plus Passport local auth
  (login is by email, not username). Routes live in routes/user.js and
  routes/recipe.js. Google OAuth, SMTP, and Gemini are unconfigured and
  degrade to disabled, so the reachable surface is local auth + recipe /
  comment / like CRUD + the image read route. No outbound network.
known_bugs:
  - "Malformed JSON body yields 500 instead of 400 — index.js error middleware
     ignores err.status/err.statusCode from body-parser. Fires UNCAUGHT_EXCEPTION
     + UNEXPECTED_5XX on any route. Known; do not resubmit."
```

Layout note — `source_root: /work/app` with the runner at `/work/run_poc.js` is
deliberate and load-bearing for **four** reasons (§8.1, §8.3, §8.5, and the one
below). Do not flatten it back to `/work`.

**The fourth reason is the strongest: the patch agent structurally cannot
modify the oracle.** `patch.py` git-inits at `source_root`, the agent's
`git diff` is scoped to that repo, and `git apply` refuses to escape it —
**verified**:

```
$ git apply /tmp/trav.diff        # --- a/../run_poc.js
error: invalid path '../run_poc.js'
rc=128                            # run_poc.js unchanged
```

With the runner one level above `source_root` there is no diff a patch agent
can emit that touches its own verifier. Under draft 2's flat `/work` layout the
runner sat inside the repo, and a patch could have edited the thing grading it.
That is the same reward-hacking concern the two-container find/grade split
exists to address, and it is worth keeping even if someone solves §8.2 and §6.2
another way.

Other notes:

- `github_url` / `commit` are **required by the loader** but only rendered into
  prompts; placeholder strings match what `targets/canary/config.yaml` does.
  **Never pass `--novelty` for this target** — `novelty.py` would be handed that
  placeholder as a clone URL.
- `build_command` syntax-checks *all* tracked JS and `.mjs`, not
  `node --check index.js`: a patch will most likely touch `db.js` or
  `routes/recipe.js`, and checking only the entrypoint would never parse them.
  `node --check` handles `.mjs` natively on Node ≥22, so one pass covers both.
  It must not invoke `npm ci` (§8.2), and it **depends on `/work/app` being a
  git repo** — see §8.2, this is the single easiest thing in the whole design to
  get silently, invisibly wrong.
- **`--cached --others --exclude-standard` is not decoration.** `git apply` does
  not stage, so a patch that *creates* a file leaves it untracked and plain
  `git ls-files` never lists it — a new broken helper module would sail through
  T0 unchecked. Verified: with a patch adding `routes/helper.js`, plain
  `ls-files` returns only `index.js`, while the flag group returns both and
  still excludes gitignored `node_modules`. Modified *tracked* files were always
  fine (listed from the index, read from the working tree); this closes the
  add-a-file case.

## 8. Harness changes required

### 8.1 BLOCKER — the agent image discards the target's Node runtime

`harness/agent_image.py:82-85`:

```python
build(f"FROM {BASE_TAG}\nCOPY --from={target_tag} /work /work\n", tag)
```

`BASE_TAG` is `gcc:14` plus Debian's `nodejs`/`npm` apt packages
(`agent_image.py:60-70`). **Only `/work` survives** — the module's own comment
says so: *"apt packages outside /work don't survive the COPY --from. Anything
the prompts promise has to live in this base layer."* Every container — find,
grade, report, judge, **and the T0–T2 patch grader** — goes through
`sandbox.agent_container` → `agent_image.ensure`.

So the target Dockerfile's base image is irrelevant at runtime, and Debian
bookworm ships Node 18.19, which cannot `require()` the ESM
`shared/ingredients.mjs` (§2). The app would throw `ERR_REQUIRE_ESM` and never
listen — in every container, on every run.

**Fix:** pin Node ≥22.12 into `agent_image.ensure_base()` (NodeSource, or copy
a tarball into the base layer). That puts `harness/agent_image.py` on the change
list — a file `docs/customizing.md` does not mention.

Two knock-ons:
- `sqlite3@5.1.2`'s native binding in `/work/app/node_modules` is compiled for a
  specific Node ABI **and architecture**. It must match the agent base's Node,
  and the image must be built on the same arch it runs on.
- The SPA-shell stub must land at `/work/frontend/dist/index.html` to survive
  the `COPY --from` and still satisfy `__dirname/../frontend/dist` (§6.2).

### 8.2 BLOCKER — `npm ci` cannot run at T0

`patch_grade.py:90-97` creates the T0–T2 container with `network="none"`,
deliberately. `npm ci` deletes `node_modules` and reinstalls from the registry;
with no egress it fails, and `--offline` needs `$HOME/.npm/_cacache`, which
lives outside `/work` and is destroyed by the same `COPY --from`. T0 would fail
before the diff is ever evaluated, on every iteration.

**Fix:** bake `node_modules` into the image at build time and never reinstall
at T0. `build_command` becomes the offline syntax check in §7.

**But that syntax check needs a git repo, and the T0 container has none.**
`patch_grade.py` only ever runs `git apply --check` / `git apply` (`:111`,
`:119`) — it never inits. The `git init` at `patch.py:85-88` happens in the
*patch agent's* container, and `grade_patch` spins a **fresh** container from
`target.image_tag`, so that init does not cross. `git ls-files` outside a repo
exits 128 with empty stdout; inside `$( )` the exit code is discarded, the loop
body never runs, and an empty `for` returns 0. **Verified:**

```
$ sh -c "for f in \$(git ls-files '*.js'); do node --check \"\$f\" || exit 1; done"
fatal: not a git repository (or any of the parent directories): .git
BUILD_COMMAND rc=0
```

T0 would pass having checked nothing — strictly worse than the
`node --check index.js` it replaced, because a patch agent could emit
syntactically invalid JS and sail through to T1.

**So the target Dockerfile must `git init` `/work/app` and make a baseline
commit.** That buys three things at once: `git ls-files` works in the T0
container; `patch.py:85`'s `git rev-parse --git-dir` short-circuits, so the
pipeline stops appending `../run_poc.js` to the app's `.gitignore` on every
run; and the app's existing `.gitignore` governs the baseline commit (§8.5).

**The command must also guard itself, because the pipeline form does not fail
loudly on its own.** A shell pipeline's exit status is the *last* command's, so
`git ls-files`'s 128 is discarded and `xargs -r` with empty stdin exits 0 —
switching from a `for` loop to `xargs` changed the syntax and nothing else.
**Verified:**

```
$ sh -c "git ls-files -z '*.js' | xargs -0 -n1 -r node --check"   # no repo
fatal: not a git repository (or any of the parent directories): .git
rc=0
```

Hence the explicit `git rev-parse` guard in §7's `build_command`, which returns
rc=1 with a diagnostic (verified). `set -o pipefail` is *not* an option here:
`docker_ops.exec_sh` runs `sh -c`, Debian's `/bin/sh` is dash, and
`dash -c 'set -o pipefail'` fails with `Illegal option -o pipefail` (verified).

An earlier revision of this section asserted the `xargs` form was
self-protecting. It was not, and the claim was never executed — the same
failure shape as the bug the section documents, inside the section documenting
it. That is what §0's rule is for.

If shipping a repo is unattractive, the no-dependency alternative must cover
`.mjs` too, or `shared/ingredients.mjs` — the file §2 identifies as the hard
Node-version dependency — goes unchecked:

```sh
find . -path ./node_modules -prune -o \( -name '*.js' -o -name '*.mjs' \) -print0 \
  | xargs -0 -n1 node --check
```

### 8.3 BLOCKER — the runner's own output fails the test suite

`test/no_console.test.js` walks the whole repo tree (skipping only
`node_modules`, `frontend`, `.git`, `data`, `test`, `.idea`, `.vscode`) and
fails if any `.js`/`.mjs` matches `/console\.\w+\(/`. The only exemption is the
specific verification-link line in `mailer.js`. `run_poc.js` must print the
`<<<DETECTION>>>` block.

**Verified:**

```
$ npm test                                              # clean tree
# tests 22  # pass 22  # fail 0    EXIT=0
$ echo 'console.log("x");' > run_poc.js && npm test
# tests 22  # pass 21  # fail 1    EXIT=1
use logger or req.log instead of console at: run_poc.js:1
```

`patch_grade.py:181` sets `t2 = rc == 0`, so the ladder would short-circuit at
T2 on the first iteration, permanently.

**Fix:** `source_root: /work/app` puts the runner at `/work/run_poc.js`, outside
the scanned tree (§7). Belt and braces: emit detection output with
`process.stdout.write`, which the regex does not match either way.

### 8.4 The rest of the change list

0. **`harness/agent_image.py`** — pin Node ≥22.12 into `ensure_base()` (§8.1).
   Listed first because nothing else runs until it is done, and because
   `docs/customizing.md`'s "where the C/C++ specifics live" map does not mention
   this file at all.
1. **`harness/detection.py`** (new, replaces `asan.py` for this target).
   `parse_detection(text)`; `signature(crash) -> (primary_class, "METHOD /route/template")`
   for dedup — **route templates, not concrete paths**, so
   `/api/recipes/${id}/like` does not fragment per id; `excerpt(crash)` for
   `found_bugs.jsonl`. Without this, §1.1's degradation applies.
2. **`harness/cli.py`** — imports `asan_excerpt`, `crash_reason`, `top_frame` at
   `:47` and uses them at `:199` (`result.json`), `:396`/`:402` (judge input),
   `:496`/`:533` (report signature, novelty), `:581-587` (`found_bugs.jsonl`
   writer), `:649` (manifest), `:1165`/`:1180`/`:1213-1214` (batch-report
   checkpoints). Every one must be rewired. **Draft 2 wrongly listed `cli.py` as
   needing no changes.**
3. **`harness/prompts/find_prompt.py`** — the §4 oracle table, the §5 schema, the
   seed fixture, and the §3.1 out-of-scope list so agents do not burn turns on
   dead code. State the repro command shape so the
   `poc_path ∈ reproduction_command` invariant holds.
4. **`harness/prompts/grade_prompt.py`** — rewrite the five criteria: (1) PoC is
   schema-valid; (2) three replays fire the same **primary** class ≥2/3
   (§4 precedence); (3) not timeout/OOM; (4) **the primary class is a genuine
   security-property violation — not a seed artefact, a `known_bugs` entry, or
   the SPA-shell 404** — this replaces "crash is in project code" and is where
   §6.2 gets its second line of defence; (5) the primary class is stable across
   runs. Note criterion 5 grades `primary_class`, **not** set equality: the full
   `classes` set may legitimately vary between replays, since a race need not
   produce a 500 every time (§5.2 point 4).
5. **`harness/patch_grade.py`** — `_t1_passes` per §6.3, plus `_focus_hint`,
   which calls `project_frames()` on ASAN output.
6. **`harness/prompts/judge_prompt.py`** — ASAN-framed throughout (`:28` "ASAN
   excerpt", `:57` "both heap-buffer-overflow", `:66` "a cleaner ASAN
   signature"). `--stream` is the *recommended* mode and this is its report
   gate, so it is not optional.
7. **`harness/prompts/system_prompt.py`** — `PIPELINE_PREAMBLE` (`:23-38`) says
   the agent "observes sanitizer output", and `DEFAULT_ENGAGEMENT_CONTEXT` says
   "an open-source C/C++ target… responsible disclosure to the upstream
   maintainer." For a private Express app that is factually wrong *and* an
   authorization-scope misstatement. Write an engagement-context file and pass
   `--engagement-context`; the harness already supports it.
8. **`harness/prompts/report_prompt.py` / `report_grader_prompt.py`** — replace
   heap layout / escalation with precondition (anonymous / any authenticated
   user / specific role), capability gained, blast radius across other users'
   rows, persistence. **`report.py` changes with them**: `_SECTIONS` at `:29` is
   `("primitive","reachability","heap_layout","escalation_path","constraints")`,
   parsed at `:145-148`, and `ReportVerdict.section_scores` keys
   (`artifacts.py:127`) follow.
9. **`harness/prompts/recon_prompt.py`** — `:20` hardcodes
   `` `{binary_path} <input_file>` ``, so `--auto-focus` emits C-shaped focus
   areas.
10. **`harness/prompts/patch_prompt.py`** — "make the PoC stop crashing" becomes
    "make the oracle stop firing without breaking `npm test`."
11. **`harness/dedup.py`** (`:23`, `:29-33`), **`harness/artifacts.py`**, and
    **`harness/patch.py`** — signature construction, the `PatchVerdict`
    `ladder_error` field from §6.3, and `_failed_tier` at `patch.py:172-181`,
    which needs the rc=1 (infra) and rc=3 (`"t1 (replay hung)"`) branches.
12. **`tests/`** — `test_patch_grade.py:17,133-146` import and assert on
    `_t1_passes`; `test_asan.py`, `test_found_bugs.py`, `test_judge.py`,
    `test_report.py`, `test_salvage.py` all encode ASAN strings.
13. **`targets/eathub/`** — Dockerfile, `config.yaml`, `README.md` (including the
    §3.3 coverage table), and `fixtures/`: one known-firing PoC (the §5 race) and
    one known-benign negative control (§6.2).

### 8.5 The `git add -A` hazard

`patch.py:83-88` makes `source_root` a git repo with a baseline commit:

```python
binary_rel = os.path.relpath(target.binary_path, target.source_root)
ignore = f"printf '%s\\n' '{binary_rel}' '*.o' >> .gitignore && "
… f"git init -q && git add -A && … commit -q -m baseline"
```

With `source_root: /work/app` that is `git add -A` over the app tree —
including `node_modules/` (**32 MB, 3 532 files** — measured; an earlier
estimate of "~200 MB, tens of thousands" was wrong) and `data/` (the SQLite db
and uploaded images). The size argument is therefore weak, but the correctness
one stands on its own: replays mutate `data/`, so a subsequent `git diff`
carries DB churn that the grader's `git apply` then rejects.

**The app already ships a `.gitignore`** covering `node_modules`, `/data`,
`.env`, and `/ai_pics`. So the action is not "write one" — it is **"do not lose
it."** A `.dockerignore` that excludes dotfiles, or a Dockerfile that COPYs an
enumerated file list instead of the tree, silently drops it and reinstates the
whole problem. Verify with `git -C /work/app status --short` inside the built
image: it must be empty (§9).

Note also that the pipeline auto-gitignores `binary_path` — with the §7 layout
`binary_rel` is `../run_poc.js`, which is harmless but is *not* doing the work;
the app's own `.gitignore` is. And once §8.2's `git init` ships in the
Dockerfile, `patch.py:85` short-circuits and stops writing to it at all.

(Draft 2 claimed "`git` must be installed in the image." Backwards: `git` is
already in the agent base — `gcc:14` derives from `buildpack-deps` — and
`git apply` works outside a repo anyway. The real requirement is the ignore
file.)

**What survives untouched:** `find.py`, `grade.py`, `sandbox.py`,
`docker_ops.py`, `agent.py`, `config.py`, `recon.py`, `judge.py`, and
`novelty.py` — nine files, with two caveats. `judge.py` carries `asan_excerpt`
only as a *parameter name* (`:27`, `:47`) and does no parsing, so it works
unchanged and only `judge_prompt.py` needs the rewrite. `novelty.py` is dead
for this target because §7 forbids `--novelty` — but `novelty.py:93` parses a
`top_frame` string, so it would break for anyone who ignored that warning.

## 9. Pre-flight

- [x] `npm ci && npm test` on a clean tree — **22/22, exit 0, ~1s.**
- [x] App boots with all integrations unset; `GET /api/recipes` → 200.
- [x] SPA-shell trap reproduced (§6.2), with `err.code`/`err.statusCode` present.
- [x] Flagship race reproduced — 20 concurrent votes → 20 rows (§3.2).
- [x] `TRIAGE.json` f003/f009/f010/f011 re-checked before demoting or promoting.
- [x] f013 ReDoS timed and settled — 0.26 ms at the 100 kB cap (§3.3).
- [x] `git apply` confirmed to refuse `../run_poc.js` (rc=128), so the layout
      protects the oracle from the patch agent (§7).
- [x] `node_modules` measured — 32 MB / 3 532 files; temp-dir copy ~50 ms.
- [ ] **The app boots inside the built agent image** (`agent_image.ensure`
      output), not just on the developer host — §8.1. Highest-risk unverified
      assumption left.
- [ ] `sqlite3` native binding loads on the agent image's Node **and arch**.
- [ ] **`build_command` fails on a deliberately broken `db.js`** — §8.2. A
      vacuous green here is invisible, which is what makes it dangerous.
- [ ] `git -C /work/app status --short` is empty inside the built image — §8.5.
- [ ] **`npm test` still passes with `run_poc.js` and the seed fixture present**
      — §8.3. The clean-tree check above does not cover this.
- [ ] **Negative-control PoC issues `GET /`, exits `0`, and fires neither
      `UNCAUGHT_EXCEPTION` nor `UNEXPECTED_5XX`** — proves the SPA stub survived
      the §6.1 copy *and* that the `reqId` correlation in §4 works. Naming both
      classes matters: a checkbox that only said "exits 0" is how the
      `UNEXPECTED_5XX` gap got in.
- [ ] **A PoC sending `Host: attacker.test` actually overrides the client
      default** and reaches `baseUrl()` — §5.2. The server side is proven; the
      client side is not, and `ORIGIN_ESCAPE` plus a third of §3.3's coverage
      rests on it.
- [ ] **The §5.1 example PoC runs end-to-end against the seeded app and exits
      `2`** — it is the exhibit every agent copies, and three consecutive drafts
      shipped one that could not execute.
- [ ] Known-firing race PoC exits `2` on 3 of 3 consecutive replays.
- [ ] Smallest `repeat` that drifts 3/3, measured and written into the find
      prompt — §3.2.
- [ ] Seed fixture written, with literal bcrypt hashes recorded.

## 10. Open questions for the `/customize` interview

- **Google OAuth stub** — this is now a quantified decision, not a taste call:
  per §3.3 it is what unblocks both HIGH-severity findings v1 misses (f001
  account takeover, f004 missing `state`). Note it would *not* make the open
  redirect reachable — §3.1 shows that sink is dead for an unrelated reason.
- **Where `targets/eathub/` lives** — harness repo, or vendored here? Vendoring
  keeps a private codebase out of the harness checkout, at the cost of a build
  context reaching outside the target dir.
- **`UNSAFE_CONTENT_TYPE` depth** — magic-byte comparison (proposed, no browser
  needed) or real headless execution? The former matches the actual finding.
- **Image size and rebuild cost** — `node_modules` is 32 MB (measured), so the
  `COPY --from` per target tag is cheap. The open question is the re-attack
  tier, which `docker commit`s the whole container (`patch_grade.py:194`) and
  `docker rmi`s it after — that is a full-image round trip per patch iteration,
  and the base layer (`gcc:14` + Node + the CLI) dominates it, not the app.
  Worth measuring before scaling `--runs`.
- **Model and parallelism**, given each replay boots a full Node process. The
  temp-dir copy is settled at ~50 ms and needs no optimisation; Node boot plus
  seed is the real per-replay cost and is still unmeasured.
