import fs from "fs";

interface TokenInfo {
	read: boolean;
	write: boolean;
	notes?: string;
}

export default class TokenManager {
	dbPath: string;
	db: Map<string, TokenInfo>

	constructor(dbPath: string) {
		this.dbPath = dbPath;
		this.readDB()
	}

	readDB() {
		const fileJson = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
		this.db = new Map(fileJson);
	}

	writeDB() {
		fs.writeFileSync(this.dbPath, JSON.stringify(Array.from(this.db.entries())));
	}

	getPerms(token: string): TokenInfo {
		return this.db.get(token)
	}

	setPerms(token: string, perms: TokenInfo) {
		let current = this.getPerms(token);
		if(current != undefined) {
			perms.notes = perms.notes != undefined ? perms.notes : current.notes;
		}
		this.db.set(token, perms);
	}

	getAll(): Map<string, TokenInfo> {
		return this.db;
	}
}
