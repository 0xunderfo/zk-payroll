/**
 * ZK Payroll Backend Server
 * Handles zero-fee claims via Plasma relayer
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import claim from "./routes/claim";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow localhost and Vercel deployments
      if (!origin) return "http://localhost:3000";
      if (origin === "http://localhost:3000") return origin;
      if (origin === "https://zk-payroll.vercel.app") return origin;
      if (origin.match(/https:\/\/zk-payroll.*\.vercel\.app/)) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
});

// API routes
app.route("/api/claim", claim);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Start server
const port = parseInt(process.env.PORT || "3001");
console.log(`ZK Payroll Backend starting on port ${port}...`);

export default {
  port,
  fetch: app.fetch,
};
