# UAT Checklist

This checklist tracks user-facing acceptance flows for Blinter in VS Code.

## Primary User Flows

- [x] Open a `.bat` file and confirm the extension activates on Windows.
- [x] Run **Blinter: Run** and confirm diagnostics appear.
- [x] Start **Launch Batch (Blinter)** debug session and confirm output appears in the Blinter Output view.
- [x] Use a suppression quick fix and confirm `LINT:IGNORE` is inserted.
- [x] Trigger **Remove All Suppressions** and confirm only suppression comments are removed.
- [ ] Run **Blinter: Create Config File** and confirm `blinter.ini` is created/opened.
- [ ] Confirm status bar indicates config presence for active `.bat`/`.cmd` files.
- [ ] Confirm diagnostics can be navigated from the Blinter Output view.

## Acceptance Notes

- Automated acceptance guard: `npm run test:uat`
- Integration acceptance coverage: `npm run test:integration`
- Last execution: 2026-02-22
