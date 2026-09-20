import fs from "node:fs";
import * as z from "zod";
import { db } from "./db.ts";
import { tokens } from "./db/schema.ts";
import { eq, InferSelectModel } from "drizzle-orm";

const TokenInfoSchema = z.object({
	read: z.boolean(),
	write: z.boolean(),
	notes: z.optional(z.string()),
});
export type TokenInfo = z.infer<typeof TokenInfoSchema>;

const TokenDBSchema = z.record(z.string(), TokenInfoSchema).transform((r) =>
	new Map(Object.entries(r))
);
type TokenDB = z.infer<typeof TokenDBSchema>;

export default class TokenManager {
	constructor() {
	}

	private rowToTokenInfo(
		t: InferSelectModel<typeof tokens> | undefined,
	): TokenInfo {
		switch (t?.permissions) {
			case "READWRITE":
				return { read: true, write: true, notes: t.notes };
			case "READ":
				return { read: true, write: false, notes: t.notes };
			case "NONE":
				return { read: false, write: false, notes: t.notes };
			default:
				return { read: false, write: false, notes: "" };
		}
	}

	async getPerms(token: string): Promise<TokenInfo | undefined> {
		const t = await db.query.tokens.findFirst({ where: { key: token } });
		return this.rowToTokenInfo(t);
	}

	async setPerms(token: string, perms: TokenInfo): Promise<void> {
		await db.transaction(async (tx) => {
			const permEnum = perms.write
				? "READWRITE"
				: (perms.read ? "READ" : "NONE");
			await tx
				.insert(tokens)
				.values({ key: token, permissions: permEnum, notes: perms.notes ?? "" })
				.onConflictDoUpdate({
					target: tokens.key,
					set: {
						permissions: permEnum,
						notes: perms.notes ?? "",
					},
				});
		});
	}

	async getAll(): Promise<Map<string, TokenInfo>> {
		const rows = await db.select().from(tokens);
		return new Map(
			rows.map((r) => [r.key, this.rowToTokenInfo(r)]),
		);
	}
}
