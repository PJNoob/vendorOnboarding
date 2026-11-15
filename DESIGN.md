# Harbor frontend

Harbor is a supplier onboarding workspace for a laboratory procurement team and its suppliers. The visual direction is restrained and grounded in scientific operations: forest green, paper white, pale mineral green, clear typography, and a visible sequence from invitation to partnership.

## User journey

- Entry: explain the partnership journey and offer supplier email verification or team Google sign-in.
- Buyer overview: show the invite → collect → verify → approve sequence, operational metrics, the supplier pipeline, and the next action.
- Supplier pipeline: search loaded applications, filter by status, and open an application.
- Review queue: focus on submitted and pending applications, verification evidence, issues, and role-authorized decisions.
- Supplier application: guide users through company, banking, tax, qualifications, ownership, documents, and submission. Each step saves independently. Navigation preserves entered fields while switching steps.
- Team administration: keep access management in a dedicated destination for administrators.

## Visual tokens

- Canvas: `#f6f8f7`; surfaces: `#ffffff`; primary text: `#243333`.
- Primary action: `#286454`; deep brand green: `#183e35`; journey surface: `#edf4ef`.
- Borders: `#e4e9e6`; secondary text: `#65756d`.
- Typography: Avenir Next, Segoe UI, system sans-serif. Page titles 30px, section titles 15–17px, body 14px, compact table data 11–12px.
- Corners: 5–7px for controls; 8–10px for principal surfaces. Borders establish hierarchy; shadows are minimal.
- Layout: persistent desktop navigation, a quiet breadcrumb bar, left-aligned content, and a contextual next-action panel. On mobile, navigation becomes a compact horizontal row and columns stack.

## Interaction principles

Use real API data and permissions. Never fill an empty dashboard with invented activity. Explain empty states with a useful next action. Keep forms labeled, errors visible, keyboard focus distinct, and motion optional. Status uses text as well as color. Qualification and ownership editors serialize to the existing API shape without exposing JSON to users.
