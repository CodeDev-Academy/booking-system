# n8n workflow harnesses

Node-only harnesses that run the **shipped** JavaScript from `n8n/*.json` against stubbed
n8n globals. No n8n instance, no restart, no browser, no database.

## Run

```
node n8n/tests/test_format.js
node n8n/tests/test_adapter.js
node n8n/tests/test_lognodes.js
node n8n/tests/test_callback_auth.js
node n8n/tests/test_voice_guard.js
node n8n/tests/test_reply_handler.js
node n8n/tests/test_simulator_ids.js
node n8n/tests/test_sweeper.js
```

Exit code `0` = every assertion passed, `1` = at least one failed. Each assertion prints
`ok` or `FAIL`; failures never stop the run, so one pass shows every break at once.

| Harness | Node under test | Assertions |
|---|---|---|
| `test_format.js` | `Format Offers & Telegram Buttons` — patient-facing grammar per option count | 22 |
| `test_adapter.js` | `Provider Config & Adapter` — routing, guards, skip reasons, dedupe stamping, request body | 62 |
| `test_lognodes.js` | the three `Log * Interaction` nodes — provider error classification | 121 |
| `test_callback_auth.js` | `07` › `Verify & Normalize Provider Event` — which token carriers authenticate, the refusal contract, channel inference, identity fields | 44 |
| `test_voice_guard.js` | `Merge Voice Guard` + `Log Skipped Channel` — fail closed on a missing payload, the held-back row, and the graph wire that carries it | 31 |
| `test_reply_handler.js` | `04` (C.2) › `Verify Reply Secret`, `Normalize Patient Reply`, `Prepare Reply Delivery`, `Log Reply Outcome`, plus graph drift guards — fail-closed auth, Meta + VoiceBip payload shapes, the one-call rule, the duplicate skip, delivery routing, the outbound row | 91 |
| `test_simulator_ids.js` | `06` › the three `Build * Response` nodes — one provider id per message, readable ids that keep the `REQ-` code, Meta's real shape, the 500 switch | 19 |
| `test_sweeper.js` | `02` (B) › the cron POST (env-resolved URL, fail-closed secret, no literal secrets), parse guards (malformed items dropped, empty sweep is a no-op), adapter mock/live gates + skip reasons, switch + onError wiring, claim-ref upserts (**one run, many responses, zipped by position** — F12 pins the live-proof defect; F13b an unpaired response posts nothing), canonical block drift guard, and that n8n writes no patient-facing words | 78 |

Counts are the harness's own output (`ok` lines), not an estimate.

## Golden rules

1. **Never test a copy.** Every harness reads the node's `jsCode` straight out of the
   workflow export it covers (`n8n/05_slot_offer_dispatcher.json`, or
   `n8n/07_provider_callback.json` for the callback auth harness). `test_voice_guard.js`
   also asserts one graph edge, because the 3.8 bug was a missing wire rather than bad code.
   `test_adapter.js` used to read a dumped `adapter_v2.js` instead — and it happened to be
   byte-identical, which is luck, not a guarantee. A dump drifts the moment the node changes,
   and a harness that reads a stale dump reports success for code that no longer exists.
2. **Red first.** When a node changes, add the assertion *before* the fix and watch it
   fail. The recorded deltas live in `TEST.md` (step 3.3: 57 red before the fix, 0 after).
3. **The drift guard is load-bearing.** `test_lognodes.js` asserts the
   `provider-error-classification` block is byte-identical in all three log nodes. Workflows
   B and C must copy that block verbatim (`N8N_BUILD_SHEET.md` §6.1 item 7); a stale paste
   fails F2 rather than silently degrading the dashboard.

## Adding a harness

Read the workflow JSON, run the node's source with `vm.runInNewContext` and the globals it
actually uses (`$input`, `$`, `$env`, and `this.helpers.httpRequest` as the context), stub
the outbound call so you can assert on the body it *would* post, then print `ok`/`FAIL` per
assertion and `process.exit(failures ? 1 : 0)`.

Fixtures must be built the way n8n builds them, not the way you imagine them: for HTTP
failures that means `{ message: '<status> - ' + JSON.stringify(body), name, stack }`, since
the status only exists as a prefix and the body is a JSON string literal.

**Stateful globals must be shared, not re-created.** `test_adapter.js` used to stub
`$getWorkflowStaticData: () => ({})` — a fresh object per call — which quietly made the
whole dedupe path untestable and let a stamp-on-attempt bug survive three phases. It now
takes an optional third argument (`run(env, overrides, staticData)`) and passes the *same*
object to consecutive runs to simulate two dispatches inside the 10-minute window. Any
future harness that touches static data must do the same.
