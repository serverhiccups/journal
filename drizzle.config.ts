import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	out: "./drizzle",
	schema: "./src/db/schema.ts",
	dbCredentials: {
		url: Deno.env.get("DB_FILE_NAME")!,
	},
});
