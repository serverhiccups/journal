import fs from "node:fs";
import * as z from "zod";

const TokenInfoSchema = z.object({
	read: z.boolean(),
	write: z.boolean(),
	notes: z.optional(z.string()),
});
type TokenInfo = z.infer<typeof TokenInfoSchema>;

const TokenDBSchema = z.record(z.string(), TokenInfoSchema).transform((r) =>
	new Map(Object.entries(r))
);
type TokenDB = z.infer<typeof TokenDBSchema>;

export default class TokenManager {
	dbPath: string;
	db: TokenDB;

	constructor(dbPath: string) {
		this.dbPath = dbPath;
		const fileJson = JSON.parse(fs.readFileSync(this.dbPath, "utf8"));
		this.db = z.parse(TokenDBSchema, fileJson);
	}

	writeDB() {
		fs.writeFileSync(
			this.dbPath,
			JSON.stringify(Object.fromEntries(this.db)),
		);
	}

	getPerms(token: string): TokenInfo | undefined {
		return this.db.get(token);
	}

	setPerms(token: string, perms: TokenInfo) {
		let current = this.getPerms(token);
		if (current != undefined) {
			perms.notes = perms.notes != undefined ? perms.notes : current.notes;
		}
		this.db.set(token, perms);
	}

	getAll(): Map<string, TokenInfo> {
		return this.db;
	}
}
