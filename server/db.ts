import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL n'est pas définie. La base est nécessaire pour persister les conversations.",
  );
}

// neon serverless utilise des WebSockets pour les connexions long-lived (pool).
neonConfig.webSocketConstructor = ws;

// idleTimeoutMillis: évacue les connexions inactives avant que Neon (serverless)
// ne les coupe de son côté (~30 s), évitant les erreurs transitoires sur les
// requêtes de la console debug qui tournent toutes les 15–30 s.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle({ client: pool, schema });
