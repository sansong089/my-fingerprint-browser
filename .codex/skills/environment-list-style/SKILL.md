---
name: environment-list-style
description: Apply this project's environment-management list/table visual style. Use when editing the environment list, table, pagination, batch toolbar, selection controls, or similar list-management UI in this repository, especially in src/views/EnvironmentsView.vue and src/components/common/PaginationBar.vue.
---

# Environment List Style

## Core Layout

Use this style for the environment-management list surface and closely related list-management tables in this project.

- Prefer `src/components/common/ListSurface.vue` for the fused list panel and `src/components/common/SplitIconButton.vue` for split icon buttons before adding page-local list or split-button markup/styles.
- Keep search/filter controls outside the list panel.
- Make the list panel a single white surface containing only the batch toolbar, table body, and pagination.
- Do not add an outer panel border. Use a white background and `6px` radius to match button radius.
- Keep the toolbar and table header visually connected; do not place a divider between them.
- Keep pagination fused to the list panel and give it matching bottom corner radius.

## Table

- Keep the table header on a white background.
- Use larger, bolder header text: about `13px`, `font-weight: 700`, slate text.
- Move the global select-all checkbox into the batch toolbar.
- Make the first table column the `编号` column; row checkboxes live inside that first column next to the row number.
- Use subtle row grid lines only in the body: `#f1f5f9` or Tailwind `slate-100`.
- Avoid vertical grid lines unless explicitly requested.

## Toolbar And Buttons

- Batch toolbar buttons should have no border and no default filled background.
- On hover, use the neutral toolbar background `#f2f2f2`, with text darkening to `#0f172a`.
- Batch toolbar dropdown menu items should keep the same neutral color treatment as toolbar buttons.
- Keep buttons compact and consistent with the existing `6px` radius.
- Split-button toggles should follow the same transparent default and darker hover treatment.
- Row action buttons and row dropdown menu action items should stay borderless and use the blue action color: default `#3b82f6`, hover background `#eff6ff`, hover text `#2563eb`.

## Pagination

- Keep pagination as part of the same white panel.
- Match the pagination top divider to body row grid lines: `border-slate-100`.
- Pagination buttons should be borderless, with neutral hover darkening consistent with toolbar buttons.

## Validation

After changing this UI, run:

```bash
npm run build
```

Treat Vite/package metadata warnings as non-blocking if the build exits successfully.
