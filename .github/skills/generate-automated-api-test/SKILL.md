---
name: generate-automated-api-test
description: "Generate API tests for a contract or work item — schema validation, error envelopes, auth scenarios."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
API style, language, framework, transport, auth model, or team** — it
generates tests for whatever HTTP / gRPC / GraphQL / event API your repo
already exposes; it does not impose one. You'll get sharper, faster
results if you fill in the per-repo specifics below.

**How placeholders work**: `{{NAME}}` strings are **documentation
placeholders, not runtime variables** — nothing substitutes them
automatically. The agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each placeholder). If the key is absent, the agent infers from repo
signals or asks you. Wire the values once in `.assert-iq/config.yaml`
and they flow into every skill that references them — no per-skill
editing required.

1. **API test framework** — set
   `.assert-iq/config.yaml > test_framework.api`. Examples and the
   idioms the agent will assume:
   - **REST Assured** (Java / Kotlin): `given().when().then()` BDD chain
   - **Karate** (any JVM): Gherkin-style scenarios, schema match
   - **supertest** (Node.js): `request(app).get(...).expect(...)`
   - **Jest + fetch / axios** (Node.js): plain assertion style
   - **Playwright APIRequest** (TS/JS/Python/.NET/Java): `request.newContext()`
   - **pytest + httpx / requests** (Python): function-based + fixtures
   - **Tavern** (Python): YAML-defined HTTP scenarios
   - **Schemathesis / Dredd** (Python / Node): property-based from OpenAPI
   - **xUnit / NUnit + HttpClient** (.NET): typed clients
   - **RestSharp / Refit** (.NET): fluent client tests
   - **rest-client / Faraday + RSpec** (Ruby): request specs
   - **resty / Postman + Newman**: collection-driven runs
   - **Bruno / Hurl / HTTPie + pytest**: file-based requests
   - **Pact / Spring Cloud Contract**: consumer-driven contracts
   - **gRPC**: `grpcurl` + framework client stubs
   - **GraphQL**: `apollo-client`, `gql` + assertion library
   - **AsyncAPI / event-driven**: contract assertions against schema registry

2. **Contract source** — set
   `.assert-iq/config.yaml > test_framework.api_contract`:
   - `openapi` (OpenAPI 3.x / Swagger) — preferred
   - `asyncapi` — event-driven APIs
   - `graphql_sdl` — GraphQL schema-first
   - `protobuf` — gRPC `.proto` files
   - `pact` — consumer-driven contracts
   - `code_inferred` — derive from controllers / handlers when no spec
     exists (lower confidence; surface this in the test header)

3. **Targeted-test command** — `{{TARGETED_TEST_COMMAND}}` runs a
   single generated test. Examples:
   - REST Assured: `mvn test -Dtest=UserApiTest#happyPath`
   - supertest: `npx jest path/to/user.test.ts -t "happy path"`
   - pytest: `pytest tests/api/test_user.py::test_happy_path`
   - Playwright APIRequest: `npx playwright test tests/api/user.spec.ts`
   - Newman: `newman run collection.json --folder "User API"`

4. **Auth model** — set
   `.assert-iq/config.yaml > test_framework.api_auth`. Examples:
   `none` | `basic` | `bearer_jwt` | `oauth2_client_credentials` |
   `oauth2_authorization_code` | `oidc` | `api_key_header` |
   `api_key_query` | `aws_sigv4` | `azure_managed_identity` |
   `mtls` | `hmac_signed`. The agent generates negative-auth scenarios
   appropriate to the model (missing, expired, wrong-role, wrong-tenant,
   wrong-audience).

5. **Environment policy** — set
   `.assert-iq/config.yaml > test_framework.api_environments` with the
   allowed base URLs / environment names. **Production is never an
   allowed target** — the agent refuses generation against prod URLs
   regardless of override. Example keys: `local`, `dev`, `qa`,
   `staging`, `ephemeral_pr`.

6. **Error contract** — set
   `.assert-iq/config.yaml > test_framework.api_error_envelope`.
   Options the agent recognizes out of the box:
   - `rfc7807` (Problem Details: `type`, `title`, `status`, `detail`,
     `instance`)
   - `json_api` (`errors[]` with `status`, `code`, `title`, `detail`)
   - `google_api_error` (`error.code`, `error.message`,
     `error.status`, `error.details[]`)
   - `custom` — point to a schema file in
     `test_framework.api_error_schema_path`

7. **Data factory / fixtures** — set
   `.assert-iq/config.yaml > test_framework.data_factory`. The agent
   reuses what you already have. Examples: `factory_bot`, `faker`,
   `factory_boy`, `bogus`, `autofixture`, `mimesis`, `polyfactory`,
   `model_factory`, `none` (inline literals). Falls back to the
   `generate-test-data` skill when absent.

8. **Mocking policy** — set
   `.assert-iq/config.yaml > test_framework.api_mocking`:
   - `live_only` — hit real downstream dependencies in a test env
   - `wiremock` | `mockoon` | `prism` | `msw` | `nock` |
     `responses` | `requests_mock` — stub downstreams
   - `vcr_cassettes` — record / replay
   - `contract_only` — use Pact / consumer-driven mocks

9. **Traceability marker** — set
   `.assert-iq/config.yaml > traceability.marker_style` so the
   generated header matches your codebase idiom (XML doc comment, JSDoc,
   docstring, KDoc, Godoc, RustDoc, etc.). The agent emits a marker
   linking the test to its tracker work item (ADO `AB#1234`, Jira
   `PROJ-123`, GitHub issue, Linear ID).

10. **Performance assertions** — set
    `.assert-iq/config.yaml > test_framework.api_perf_assertions`:
    - `none` (default) — functional only
    - `soft` — record response time, warn over threshold
    - `hard` — fail if response time exceeds
      `test_framework.api_response_time_ceiling_ms`
    Functional API tests are **not** load tests; treat perf assertions
    as smoke-level only.
-->

# Generate automated API test

Produce framework-conformant API tests. API tests validate the contract
between services — they are higher-leverage than UI tests and
lower-level than business workflows.

This skill is **API-style-, language-, framework-, transport-,
auth-model-, and team-agnostic**. It generates tests for whatever
API your repo exposes (see customization points 1–4 above).

## Pre-conditions

- A target is identified: endpoint, contract reference (see
  `test_framework.api_contract`), or tracker work item.
- An environment policy is in place
  (`test_framework.api_environments`) — generation against production
  is refused.
- Auth model and required secrets are reachable via the project's
  secret manager (not embedded).

## Inputs you must collect

- **Target** — endpoint path + method, OpenAPI / AsyncAPI / GraphQL /
  protobuf reference, or work item ID.
- **Framework** — read from
  `.assert-iq/config.yaml > test_framework.api`. Ask if absent.
- **Contract source** — read from `test_framework.api_contract`.
- **Auth model** — read from `test_framework.api_auth`.
- **Target environment** — must be one of
  `test_framework.api_environments`; never production.
- **Tracker reference** — the ADO ID / Jira key / issue number to
  embed in the traceability header.

## Procedure

1. **Identify the contract.**
   - Pull from the source in `test_framework.api_contract`. Prefer
     spec-first (OpenAPI / AsyncAPI / GraphQL SDL / protobuf) when
     present.
   - Fall back to handler / controller inference when no spec exists;
     mark generated tests as `contract: inferred` in the header to flag
     lower confidence.
   - Extract: request schema, response schema(s), status codes,
     required headers, auth requirements, idempotency hints, pagination
     / filter / sort parameters.

2. **Generate scenarios** covering the universal taxonomy:
   - **Happy path** — valid request, 2xx response, **full** schema
     validation of the response body (not field cherry-pick).
   - **Authentication** (per `test_framework.api_auth`) — unauthenticated,
     malformed credential, expired token, wrong audience / issuer.
   - **Authorization** — wrong role, cross-tenant, cross-user,
     forbidden scope where applicable.
   - **Input validation** — required fields missing, type mismatches,
     boundary violations, malformed encoding → expected 4xx matching
     the project's `api_error_envelope`.
   - **Conflict / state errors** — duplicate creates, stale updates
     (ETag / If-Match), not-found, gone.
   - **Server / dependency errors** — graceful failure of downstreams
     where testable per `test_framework.api_mocking`.
   - **Idempotency** — for endpoints that claim idempotency
     (`PUT`, `DELETE`, retried `POST` with idempotency key), verify it.
   - **Pagination, filtering, sorting** — where the endpoint supports
     them; verify boundary pages, invalid cursors, empty results.
   - **Rate limiting / throttling** — only when the contract documents
     it and the test environment honors it.
   - **Content negotiation** — `Accept` / `Content-Type` variants when
     the API supports them.

3. **Assertion strategy.**
   - Status code AND response schema (full schema validation, not
     field cherry-pick — schema drift is a top silent-failure mode).
   - Critical business fields by name with explicit expectations.
   - Error envelopes conform to `test_framework.api_error_envelope`.
   - Response time per `test_framework.api_perf_assertions` (soft /
     hard / none).
   - Correlation / trace headers echoed when the contract requires
     them.

4. **Test data.**
   - Use the project's `test_framework.data_factory` to seed inputs
     and expected entities.
   - If absent, generate deterministic data via the
     [`generate-test-data`](../generate-test-data/SKILL.md) skill —
     do not invent hard-coded literals unless the contract demands a
     specific value.
   - Clean up created entities in teardown; never leave residue in
     shared environments.

5. **Mocking** per `test_framework.api_mocking`. Record cassette /
   stub fingerprints in the test header when applicable so drift can
   be detected later.

6. **Emit the traceability header** in the idiom set by
   `traceability.marker_style`, including the tracker reference and
   (when inferred) the `contract: inferred` flag.

## Stop conditions

- The configured target environment is production, or no environment
  is reachable — refuse and surface.
- Auth credentials would need to be embedded in source — refuse;
  require the project's secret manager.
- The contract cannot be located or inferred with reasonable confidence
  — surface and ask.
- The endpoint handles PII / regulated data and the request to
  generate tests would require real customer data — refuse; require
  synthetic data.

## Governance

- **Never** generate tests targeting production endpoints. Confirm the
  target environment against `test_framework.api_environments`.
- **Never** commit credentials, tokens, certificates, or signing keys.
  Use the project's secret manager.
- **Never** skip full schema validation in favor of cherry-picked
  fields — schema drift is one of the most common silent failure
  modes.
- For endpoints handling PII or regulated data, reference only
  synthetic data; never embed real customer data in tests.
- Generated tests are **drafts** and require human review before
  merge, per the QI foundation.

## Output

A test file (or files) in the location your repo uses for API tests,
written in `test_framework.api`'s idiom, with:

- traceability header linking to the tracker work item
- one test per scenario from step 2 (named after the scenario)
- full-schema response assertions
- error-envelope assertions matching `api_error_envelope`
- teardown that cleans up any created entities

## Signals emitted

When the QI signal sink is wired, this skill emits a
`test.generated.api` signal per generation conforming to
`.assert-iq/signal-schema.json`, carrying: `target`, `framework`,
`contract_source`, `contract_confidence`
(`spec` | `inferred`), `scenarios_generated`, `auth_model`,
`mocking_mode`, `environment`, and `tracker_ref`.

## Verify with oracle (v1.6.0+)

Generated API tests are AI-authored. Verify contract coverage and
assertion quality before merge. Use the unit-test rubric to evaluate
scenarios and assertions:

```
/grade-with-rubric <api_test_file>  --rubric-id=test-unit-v1.0
```

Oracle provides objective feedback on test independence, determinism,
and focus in the API test layer.
