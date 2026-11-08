# Inventopedia UX contract

## Product context

Inventory teams manage organisations, projects, items and stock. `docs/API_V1.md`
and server authorization are authoritative for permissions, pagination and data
lifecycle. English is the initial locale; dates use the browser's locale. Target
WCAG 2.2 AA.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native select | This contract | native | keyboard |
| Date | Native date input | This contract | native | keyboard |
| Form | Shared field and dialog styles | This contract | create / edit | component tests |
| Scrollbar | Global stylesheet | DESIGN.md | native geometry | browser |
| Feedback | Shared status region | This contract | success / error | live-region test |
| CRUD | API client and workspace | docs/API_V1.md | list / create / edit | API tests |

## Navigation and state

Organisation and project selection scope all workspace requests. Lists use the
API's cursor pagination; refresh starts from the first page. Changes are
pessimistic and duplicate submissions are disabled. Errors remain visible until
dismissed or retried. Expired sessions preserve unsaved input and direct the user
to copy changes before signing in again.
Narrow layouts retain all navigation and allow horizontal table scrolling.
Item search is transient because item names can be sensitive and the current
workspace has no URL routing; it is debounced and superseded requests are ignored.

## Forms and feedback

Forms use explicit labels and text errors, preserve input on failure, and use
`noValidate`. Passwords are masked with a show/hide control. Success and failure
are announced through a shared live region. Destructive actions name the object
and consequences in an accessible dialog; no browser confirmation dialogs.

## Security and lifecycle

Never put service-role keys in browser code. Do not infer roles or quotas from
client state; the API remains authoritative. Published template versions and
stock movement history follow the immutable lifecycle in `docs/API_V1.md`.
