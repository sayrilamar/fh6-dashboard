---
name: generate-test-data
mode: agent
description: "Generate deterministic, framework-conformant test data for a scenario — no flakes from data drift."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
language, framework, database, platform, or team** — it uses whatever
data-construction pattern your repo already has (factories, fixtures,
seeds, builders, mocks); it does not impose one. You'll get sharper,
faster results if you fill in the per-repo specifics below.

**How placeholders work**: `{{NAME}}` strings are **documentation
placeholders, not runtime variables** — nothing substitutes them
automatically. The agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each point). If the key is absent, the agent infers from repo signals
or asks you. Wire the values once and the values flow into every skill
that references them.

1. **Data construction pattern** — set
   `.assert-iq/config.yaml > test_data.pattern`. Supported values:
   - `factory_bot`            (Ruby)
   - `factoryboy`             (Python)
   - `model_bakery`           (Python / Django)
   - `pytest_fixtures`        (Python)
   - `faker_js`               (JavaScript / TypeScript)
   - `fishery`                (TypeScript)
   - `test_data_bot`          (TypeScript)
   - `autofixture`            (.NET)
   - `bogus`                  (.NET)
   - `nbuilder`               (.NET)
   - `mother_object`          (any — Object Mother pattern)
   - `builder_pattern`        (any — Test Data Builder pattern)
   - `instancio`              (Java)
   - `easy_random`            (Java)
   - `datafaker`              (Java / Kotlin)
   - `fixture_files`          (JSON / YAML / SQL seeds)
   - `db_migrations`          (Rails / Django / Flyway / Liquibase)
   - `factory_go`             (Go)
   - `gofakeit`               (Go)
   - `rust_fake`              (Rust)
   - `quickcheck_arbitrary`   (Rust / Haskell)
   - `none`                   (ad-hoc literal data — agent will recommend a pattern)
   - `auto`                   (default — agent detects from repo signals)

2. **Faker locale** — set `.assert-iq/config.yaml > test_data.locale`
   (default `en_US`). Many faker libraries support locale-aware names,
   addresses, phone numbers, postal codes. Set this when test
   assertions encode locale-specific formats (e.g. `de_DE` for German
   postal codes, `ja_JP` for Japanese addresses, `ar_SA` for RTL).

3. **Determinism seed** — set
   `.assert-iq/config.yaml > test_data.seed` (default `42`). Every
   randomised generator must accept this seed so the same scenario
   produces identical data across runs. The agent **refuses** to emit
   non-seeded random data (see Governance).

4. **PII-safe domains** — the agent uses RFC-reserved test values by
   default:
   - email: `@example.com`, `@example.org`, `@example.net` (RFC 2606)
   - phone: `555-01xx` (NANP), `+44 113 496 xxxx` (Ofcom drama numbers)
   - credit card: `4111-1111-1111-1111` (Visa test BIN), Stripe test cards
   - SSN / NI: project's documented test ranges only
   - IP: `192.0.2.x`, `198.51.100.x`, `203.0.113.x` (RFC 5737)
   Override via `.assert-iq/config.yaml > test_data.safe_domains` if
   your team uses a different convention.

5. **Database / persistence layer** — set
   `.assert-iq/config.yaml > test_data.persistence`. Supported:
   `postgres`, `mysql`, `sqlite`, `mssql`, `oracle`, `mongodb`,
   `dynamodb`, `cosmos`, `cassandra`, `redis`, `elasticsearch`,
   `in_memory`, `none`. Drives the teardown idiom (transaction
   rollback, schema truncate, container reset, document delete, etc.).

6. **Teardown strategy** — set
   `.assert-iq/config.yaml > test_data.teardown`. Supported:
   - `transaction_rollback`  (preferred — wrap each test in a
     transaction and roll back)
   - `truncate_tables`       (faster than delete; preserves schema)
   - `delete_by_id`          (per-test cleanup of created records)
   - `ephemeral_container`   (Testcontainers / Docker fresh per test)
   - `snapshot_restore`      (database snapshot rollback)
   - `none`                  (in-memory only; nothing to tear down)
   - `auto`                  (default — agent infers from the pattern)

7. **Compliance posture** — set
   `.assert-iq/config.yaml > governance.compliance` (shared key,
   already used by other skills). Values: `none | hipaa | pci | sox |
   gdpr | ccpa | iso27001 | fedramp | custom`. The agent refuses to
   emit fields that would constitute regulated data (real-looking
   PHI, PAN, etc.) and instead routes through your compliant
   test-data layer.

8. **Production-data guardrail** — the agent **never** copies, masks,
   or anonymises production data. If your team uses a
   masking/anonymisation pipeline, point at it via
   `.assert-iq/config.yaml > test_data.compliant_data_source` and the
   agent will recommend its use rather than generate inline.

9. **Volume profile** — for scenarios needing more than a few
   records, set `.assert-iq/config.yaml > test_data.volume_profile`:
   `single | pagination_small (~25) | pagination_large (~1k) |
   bulk (~10k) | custom`. The agent picks the cheapest profile that
   exercises the assertion.

10. **Output location** — set
    `.assert-iq/config.yaml > test_data.output_path`. Examples:
    - `./tests/factories/`           (factory_bot, factoryboy)
    - `./tests/fixtures/`            (JSON / YAML)
    - `./db/seeds/`                  (database seeds)
    - `inline`                       (write directly into the test file)
    Default: `auto` — collocate next to the test that consumes the data.

11. **Platform notes** — this skill is platform-agnostic (web, mobile,
    desktop, embedded, IoT, ML, data-pipeline, infra). For
    ML/data-science scenarios, generators may also produce
    deterministic feature vectors, tensors, and parquet/CSV samples
    using the same seed contract.
-->

# Generate test data

Test data is where flakiness and brittleness are born. Produce
deterministic, isolated, PII-safe test data using the project's existing
data-construction pattern.

This skill is **framework-, language-, database-, and
platform-agnostic** (see customization points 1, 5, 11 above).

## Pre-conditions

- A test scenario or AC is identified (free-form description is acceptable).
- `.assert-iq/config.yaml` is readable, or the agent can infer
  `test_data.pattern` from repo signals (presence of `factories/`,
  `fixtures/`, `conftest.py`, `*.factory.ts`, etc.).
- The compliance posture (`governance.compliance`) is known. When
  unset, the agent assumes the strictest reasonable default for the
  data shape (e.g. `gdpr` for any record containing names/emails).

## Inputs you must collect

- **Target scenario** — AC reference, test name, or freeform
  description. Required.
- **Data shape** — entities, relationships, and field constraints. If
  the schema is unclear, the agent reads model/migration/DTO files in
  the repo and asks for the gaps.
- **State requirements** — e.g. "user with active subscription", "order
  in `shipped` status", "tenant with feature flag X enabled".
- **Volume** — single record vs. dataset (see customization point 9).
- **Determinism seed** — defaults to `test_data.seed` (= `42`); pass
  per-invocation to vary.

## Procedure

1. **Detect the existing data pattern.** Inspect the project for:
   - Test factories (FactoryBoy, Factory Bot, AutoFixture, Bogus,
     Fishery, faker-js, Instancio, etc.)
   - Fixture files (JSON, YAML, SQL seeds)
   - Database migrations / seed scripts (Rails, Django, Flyway,
     Liquibase, SQLite, Entity Framework)
   - API stubs / contract mocks (WireMock, MSW, Pact stubs)
   - Object Mother / Test Data Builder helpers

   Use what exists. **Do not introduce a new data approach without
   explicit confirmation.** If multiple patterns coexist, prefer the
   one closest to the test file under change.

2. **Identify the data needs:**
   - Required entities and their relationships (FKs, embeddings, joins)
   - Required field values: boundary, edge, realistic-but-fake
   - Required state (subscription tier, status, feature flags, roles)
   - Volume per customization point 9
   - Cross-cutting concerns: tenancy, locale, time zone, currency

3. **Generate the data with these universal rules:**
   - **Deterministic** — same scenario produces same data; seed any
     randomness with `test_data.seed`.
   - **Isolated** — each test owns its data; no shared mutable state
     across tests. Prefer transaction rollback (see teardown).
   - **PII-safe** — use RFC-reserved test domains (point 4) and your
     project's safe-data conventions. **Never** real names, emails,
     addresses, payment data, government IDs.
   - **Realistic shape** — values respect the schema's constraints,
     not just types (a phone field has a phone-shaped value; an
     ISO-3166 country code is a real code; a UUID is RFC 4122-valid).
   - **Cleanup-aware** — surface a teardown strategy with the data
     (per customization point 6).
   - **Locale-aware** — when assertions depend on locale-specific
     format, respect `test_data.locale`.

4. **For non-trivial relationships**, emit the factory/fixture/builder
   chain rather than inline literals. Example flavors (the agent uses
   the configured pattern's idiom):
   ```python
   # FactoryBoy (Python)
   user = UserFactory(subscription__tier="premium")
   ```
   ```typescript
   // Fishery (TypeScript)
   const order = orderFactory.build({ status: "shipped", lines: lineFactory.buildList(3) });
   ```
   ```csharp
   // AutoFixture (.NET)
   var fixture = new Fixture();
   fixture.Customize<Order>(c => c.With(o => o.Status, OrderStatus.Shipped));
   ```
   ```ruby
   # FactoryBot (Ruby)
   create(:user, :premium, orders: build_list(:order, 3, status: :shipped))
   ```

5. **For ML / data-pipeline scenarios**, emit a deterministic
   generator (numpy seed, pandas DataFrame with a fixed `random_state`,
   parquet/CSV under `test_data.output_path`). Tensors and feature
   vectors must round-trip identically across runs.

6. **Validate**:
   - Re-run the generator with the same seed and confirm byte-identical
     output.
   - Confirm the generated values satisfy the schema constraints
     (length, enum, regex, FK existence) before handing to the caller.
   - Confirm no field accidentally encodes a real-world identifier
     (run a cheap regex sweep over names/emails/numbers).

## Stop conditions

- The scenario requires real production data (e.g. reproducing a
  specific customer bug) — **stop**, recommend the team's
  compliant masking/anonymisation pipeline (point 8), and surface
  the request to a human.
- The project has no data pattern and the scenario requires
  non-trivial data — **stop**, propose a pattern (with a 1-line
  rationale) before generating ad-hoc data.
- The required data would violate the active compliance posture —
  **stop**, route through the compliant test-data layer.
- Determinism cannot be achieved (e.g. external API with no seed
  control, real-clock dependency without a clock abstraction) —
  **stop**, surface the determinism gap.

## Governance

- **Never** use production data. Never reference real customer
  identifiers, even partially (no "last 4 digits" of real PAN, no
  "first letter of real surname").
- **Never** include credentials, tokens, API keys, or session
  cookies in test data files — even fake-looking ones. Use the
  project's secret manager for any auth context.
- **Never** generate data that violates `governance.compliance`.
- **Never** emit non-seeded random data. If a generator does not
  expose a seed, wrap it or pick a different generator.
- **Preserve traceability**: when the data backs a test that carries
  a `qi-trace` / `AB#1234` / Jira-key header, mirror that reference
  in the factory/fixture file's leading comment.

## Output

- The factory call(s), fixture file(s), seed script, or builder chain
  in the configured pattern, written to `test_data.output_path`.
- A teardown snippet matching `test_data.teardown`.
- A one-paragraph "data contract" note: what was assumed
  (`seed_users()` has run, FK `tenant_id=1` exists, clock pinned to
  `2024-01-01T00:00:00Z`), what was seeded, and how to reproduce.
- Recommendations for any AC that suggests automation (e.g. "this
  scenario would benefit from a property-based test — see
  `generate-automated-unit-test`").

## Signals emitted

When the QI signal sink is wired, this skill emits a
`test.generated.data` signal per generation conforming to
`.assert-iq/signal-schema.json`, carrying: `scenario`, `pattern`,
`entities`, `volume_profile`, `locale`, `seed`, `persistence`,
`teardown_strategy`, `compliance_posture`, and `tracker_ref`.
