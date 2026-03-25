import cors from "cors";
import express from "express";
import { createServer } from "http";
import { config } from "./config.js";
import { initializePersistence, isSupabaseEnabled } from "./data/store.js";
import { authenticate, authorize } from "./middleware/auth.js";
import { setupRealtime } from "./realtime/hub.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { studentRouter } from "./routes/student.js";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS policy"));
    },
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "secure-exam-api" });
});

app.use("/auth", authRouter);
app.use("/admin", authenticate, authorize("admin"), adminRouter);
app.use("/student", authenticate, authorize("student"), studentRouter);

const server = createServer(app);
setupRealtime(server);

void (async () => {
  await initializePersistence();
  server.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
    console.log(`Persistence mode: ${isSupabaseEnabled() ? "Supabase" : "In-memory fallback"}`);
  });
})();
