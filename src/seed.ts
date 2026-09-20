import { drizzle } from "drizzle-orm/libsql";
import { eq, InferInsertModel } from "drizzle-orm";
import { journalTable, relations, sections, tokens } from "./db/schema.ts";
import { TokenInfo } from "./tokens.ts";

const db = drizzle(Deno.env.get("DB_FILE_NAME")!, { relations });

const journalJson: any = JSON.parse(
	await Deno.readTextFile("./journaldb.json"),
);

const journal: typeof journalTable.$inferInsert = {
	title: journalJson["title"],
	contact: journalJson["contact"],
	faviconEmoji: journalJson["faviconEmoji"],
};

await db.delete(journalTable);
await db.insert(journalTable).values(journal);

await db.delete(sections);
await db.insert(sections).values(
	journalJson.sections.map((s: any, i: number) => ({ ...s, position: i })),
);

// console.log(await db.select().from(sections).all());

const t: Record<string, TokenInfo> = JSON.parse(
	await Deno.readTextFile("./tokendb.json"),
);

await db.delete(tokens);
await db.insert(tokens).values(
	(new Map(Object.entries(t))).entries().map((e) => {
		return {
			key: e[0],
			permissions: e[1].write ? "READWRITE" : (e[1].read ? "READ" : "NONE"),
			notes: e[1].notes ?? "",
		} as InferInsertModel<typeof tokens>;
	}).toArray(),
);
