import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { defineRelations } from "drizzle-orm/relations";

export const journalTable = sqliteTable("journal", {
	id: integer().primaryKey(),

	title: text().notNull(),
	contact: text().notNull(),
	faviconEmoji: text().notNull(),
});

export const sections = sqliteTable("sections", {
	id: integer().primaryKey(),
	title: text().notNull(),
	date: text().notNull(),
	markdown: text().notNull(),
	html: text().notNull(),

	position: integer().notNull(), // Not unique because it means that we can't reorder things!
});

export const PERMISSIONS = ["NONE", "READ", "READWRITE"] as const;

export const tokens = sqliteTable("tokens", {
	key: text().primaryKey(),
	permissions: text({ enum: PERMISSIONS }).default("NONE").notNull(),
	notes: text().notNull(),
});

export const relations = defineRelations(
	{ sections, journalTable, tokens },
	(_r) => ({
		journalTable: {},
		sections: {},
		tokens: {},
	}),
);
