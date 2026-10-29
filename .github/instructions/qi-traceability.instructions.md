---
applyTo: "**/*.{cs,xaml,ts,tsx,js,jsx,mjs,py,go,java,kt,kts,rb,rs,swift,php,scala,vue,svelte,razor,cshtml}"
description: "Requirement → code → test traceability enforcement (language-agnostic; marker style from config)."
---

# Traceability instructions

**When this applies:** introducing or modifying **production source code** that
implements a tracked work item, in any language. Copilot loads this via
`applyTo`; Claude Code: apply whenever the user adds or changes production code
tied to a work item. Test code belongs to `qi-test-design.instructions.md`.

The `applyTo` glob is deliberately **inclusive** — a fresh install must not be
silently inert on a stack nobody listed. `/assert-iq-tailor` narrows it.

## 1. Resolve the marker style (do this first)

Read `.assert-iq/config.yaml > traceability.marker_style`. **The configured
value wins over language idiom** — a repo that standardizes on one marker across
a polyglot codebase is making a deliberate choice, and silently "improving" it
per-file makes the matrix unparseable.

| `marker_style` | Form |
|---|---|
| `generic` *(shipped default)* | `// qi-trace: <WORK-ITEM>` — comment syntax adapted to the language |
| `qi_trace_xml` | `/// <qi-trace work-item="AB#1234" … />` (C# / XAML doc comments) |
| `javadoc` | `/** @qi-trace AB#1234 */` (Java / Kotlin / Scala) |
| `jsdoc` | `/** @qi-trace JIRA-1234 */` (JS / TS) |
| `python_doc` | `""":qi-trace: JIRA-1234"""` |
| `python_decorator` | `@qi_trace("JIRA-1234")` |
| `go_comment` | `// qi-trace: GH-1234` |
| `rust_doc` | `/// qi-trace: LIN-1234` |
| `ruby` | `# qi-trace: SHORTCUT-1234` |
| `swift_doc` | `/// - qi-trace: PROJ-1234` |

`csharp_xml` is a legacy alias for `qi_trace_xml`. When `marker_style` is unset
or `generic`, use the language's ordinary comment syntax with the field names
below verbatim. When the resolved style has no natural form in the language at
hand (`jsdoc` in a `.py` file), use the language's idiom and state the
substitution — never invent a hybrid silently.

## 2. Required fields

Every trace carries all four:

- `work-item` — the ADO work item ID or Jira/Linear/GitHub issue key
- `acceptance-criteria` — the AC reference (e.g. `AC-2`)
- `risk-tier` — `low | medium | high`
- `test-coverage` — relative path(s) to the covering test file(s), specific
  enough to open: a file or test class, never a bare directory

**If you do not have a real work-item ID, do not invent one.** Emit the marker
with `work-item="TODO(qi-trace): unresolved"` and tell the user which value is
missing. A fabricated ID is worse than a missing one — it produces a
traceability matrix that looks complete and audits false.

## 3. What carries a marker — and what does not

Attach a marker to the unit that **implements** a tracked work item: the new
function, class, module, endpoint, page, or ViewModel the AC describes. Do
**not** mark private helpers, extracted sub-functions, or renames carrying no AC
of their own (the enclosing traced unit covers them), pure refactors,
formatting, dependency bumps, generated code, or test files.

Over-tagging is a real failure mode: a marker on every helper makes the matrix noisy and trains the team to ignore it.

## 4. Modifying code that already carries a trace

Never silently drop or alter an existing trace. If your change invalidates it —
the AC no longer matches, or `test-coverage` points at a file that has moved or
been deleted — **flag it and ask the user to confirm the new linkage.** Do not
repair the path by guessing which test replaced it.

## 5. Markup paired with code-behind

Where a framework splits one unit across markup and code — MAUI / Xamarin XAML
with `.xaml.cs`, Razor with `.cshtml.cs`, Vue/Svelte SFCs — trace the class
declaration in the code file and add an equivalent comment above the markup
root. Both traces **must** cite the same `work-item` and `acceptance-criteria`;
flag any mismatch.

```csharp
/// <qi-trace
///   work-item="AB#1234"
///   acceptance-criteria="AC-3"
///   risk-tier="medium"
///   test-coverage="tests/UI/LoginPageTests.cs" />
public partial class LoginPage : ContentPage { … }
```

```xml
<!-- qi-trace: work-item="AB#1234" acceptance-criteria="AC-3" risk-tier="medium" test-coverage="tests/UI/LoginPageTests.cs" -->
<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui" …>
```

The same shape in a JS/TS repo under `marker_style: jsdoc`:

```ts
/**
 * @qi-trace
 *   work-item="JIRA-482"
 *   acceptance-criteria="AC-2"
 *   risk-tier="medium"
 *   test-coverage="src/checkout/hooks/useCheckoutTotals.test.ts"
 */
export function useCheckoutTotals(...) { … }
```
