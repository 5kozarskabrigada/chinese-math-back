# Phase 1 Notes

## Scope completed

- Browser-only foundation
- Role-separated dashboards
- Core exam entry controls (active exam + authorization + camera verification checks)
- Violation logging path from frontend to backend

## Known constraints (browser-only)

- Cannot enforce OS-level app switching lockout
- Cannot prevent screenshots at OS level
- Fullscreen enforcement is detectable, not absolutely unbreakable

## Recommended next phase

1. Add PostgreSQL schema and repository layer
2. Add websocket realtime monitoring
3. Add warning modal push from admin to student via realtime channel
4. Add append-only log integrity hash chain
5. Add full question model and per-question save timestamps
