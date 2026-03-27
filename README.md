# Secure Exam Platform (Browser-Only)

Initial implementation for a controlled web-based examination system with separate Admin and Student experiences.

## Implemented in this phase

- Monorepo with `apps/web`, `services/api`, `packages/shared`
- Role-based authentication (admin/student)
- Admin endpoints for dashboard, students/classrooms/exams, logs, warnings, termination
- Student flow for camera verification, phone link, exam code join, submit
- Browser-only monitoring event capture hooks (tab switch + fullscreen exit)
- Socket.io realtime channel for admin live updates, warning push, and student warning acknowledgments
- Strict exam shell UI baseline aligned to your design direction

## Quick start

1. Install dependencies:
   - `npm install`
2. Run API:
   - `npm run dev:api`
3. Run Web:
   - `npm run dev:web`
4. Open:
   - Web: `http://localhost:5173`
   - API health: `http://localhost:4000/health`

## Demo credentials

- Admin: `admin-1` / `admin123`
- Student: `stu-1001` / `student123`

## Environment

Create `services/api/.env` (optional for now):

```env
PORT=4000
JWT_SECRET=replace-with-strong-secret
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ALLOWED_ORIGINS=http://localhost:5173,https://your-vercel-domain.vercel.app
```

## Supabase persistence

1. In Supabase SQL editor, run [docs/supabase-schema.sql](docs/supabase-schema.sql)
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `services/api/.env`
3. Restart API; startup log prints `Persistence mode: Supabase`

If Supabase env vars are missing, API automatically uses in-memory fallback.

## Deployment (Vercel + Render)

### Render (API)

1. Connect repository to Render and use `render.yaml` at the repo root.
2. Set secret env vars in Render dashboard:
   - `JWT_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ALLOWED_ORIGINS` (include your Vercel domain)
3. Deploy and confirm health endpoint:
   - `https://your-render-api.onrender.com/health`

### Vercel (Web)

1. Import repository and set root directory to `apps/web`.
2. Add environment variable:
   - `VITE_API_URL=https://your-render-api.onrender.com`
3. Deploy and verify login + dashboard calls succeed.

### Cross-origin checklist

- `ALLOWED_ORIGINS` in API must include the exact Vercel domain.
- Socket.io uses the same allowed-origins list as REST CORS.
- If Vercel preview URLs are used, add each preview domain or use controlled wildcard strategy via reverse proxy.

## Next implementation targets

- Two-camera streaming channels (webcam + mobile pairing stream)
- Immutable/tamper-evident event store
- Full question engine (MCQ, fill, structured math input, geometry assets)
- Admin-controlled result release and recycle bin restore/delete flows
