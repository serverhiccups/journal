import { drizzle } from "drizzle-orm/libsql";
import { relations } from "./db/schema.ts";

export const db = drizzle(Deno.env.get("DB_FILE_NAME")!, { relations });
