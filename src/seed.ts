import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { journalTable, relations, sections } from "./db/schema.ts";

const db = drizzle(Deno.env.get("DB_FILE_NAME")!, { relations });

const journal: typeof journalTable.$inferInsert = {
	title: "Testing DB",
	contact: "hello@email.net",
	faviconEmoji: "X",
};

await db.delete(journalTable);
await db.insert(journalTable).values(journal);

const f: any = JSON.parse(await Deno.readTextFile("./journaldb.json"));

await db.delete(sections);
await db.insert(sections).values(
	f.sections.map((s: any, i: number) => ({ ...s, position: i })),
);

console.log(await db.select().from(sections).all());
