import { serveDir } from "@std/http/file-server";
import path from "node:path";
import archiver from "archiver";
import { Readable } from "node:stream";
import filesize from "file-size";
import * as z from "zod";

import ejs from "ejs";

import { Hono, MiddlewareHandler } from "hono";
import { getConnInfo, serveStatic } from "hono/deno";
import { CookieStore, Session, sessionMiddleware } from "hono-sessions";
import { rateLimiter } from "hono-rate-limiter";

import TokenManager, { TokenInfo } from "./tokens.ts";
import JournalManager from "./journal.ts";
import { optimise as optimiseAsset } from "./optimiseAssets.ts";

type SessionDataType = {
	lastIncorrect: boolean;
	token?: string;
	perms?: TokenInfo;
};

type Env = {
	Variables: {
		session: Session<SessionDataType>;
		session_key_rotation: boolean;
	};
};
const app = new Hono<Env>();

const tokens = new TokenManager();
const journal = new JournalManager();
process.on("SIGINT", () => {
	process.exit(0);
});

const requiredEnv = ["DB_FILE_NAME", "COOKIE_KEY", "PORT_NUMBER"];
requiredEnv.forEach((v) => {
	if (!Deno.env.has(v)) throw new Error(`Environment variable ${v} was empty`);
});

const requirePermission = (
	permission: keyof Omit<TokenInfo, "notes">,
): MiddlewareHandler => {
	return async (c, next) => {
		const session = c.get("session");

		if (!session.get("perms")?.[permission]) {
			c.status(403);
			return c.text("Forbidden");
		}

		await next();
	};
};

declare module "hono" {
	interface ContextRenderer {
		(
			templateName: string,
			options: Record<string, any>,
		): Response | Promise<Response>;
	}
}

const useTemplate = (): MiddlewareHandler => {
	const views = path.resolve("./views");
	return async (c, next) => {
		c.setRenderer(
			(templateName, options) => {
				return c.html(
					ejs.renderFile(views + "/" + templateName, options, {
						strict: false,
						root: views,
					}),
				);
			},
		);
		await next();
	};
};

const store = new CookieStore();

app.use(
	"*" as string,
	sessionMiddleware({
		store,
		encryptionKey: Deno.env.get("COOKIE_KEY")!,
		expireAfterSeconds: 60 * 1000 * 60 * 60 * 24, // two months
		autoExtendExpiration: true,
		cookieOptions: {
			sameSite: "Lax",
			path: "/",
			httpOnly: true,
		},
	}),
);

const api = new Hono<Env>();

api.use(
	rateLimiter<Env>({
		windowMs: 1000 * 60 * 60 * 2,
		keyGenerator: (
			ctx,
		) => (ctx.req.header("x-forwarded-for") ??
			getConnInfo(ctx).remote.address ?? ""),
		limit: 15,
		skip: (ctx) => !!ctx.get("session").get("perms")?.read,
		standardHeaders: false,
	}),
);

const Login = z.object({
	token: z.string(),
});

api.post("/login", async (c) => {
	const body = Login.parse(await c.req.parseBody());
	if (body.token != undefined) {
		//console.log("checking perms")
		const perms = await tokens.getPerms(body.token);
		const session = c.get("session");
		if (perms == undefined || !perms.read) {
			session.set("lastIncorrect", true);
			return c.redirect("/");
		}
		session.set("lastIncorrect", false);
		session.set("token", body.token);
		session.set("perms", perms);
		//console.log("logged in")
		return c.redirect("/journal");
	}
});

api.post("/logout", (c) => {
	const session = c.get("session");
	session.deleteSession();
	return c.redirect("/");
});

const UpdatePerms = z.object({
	token: z.string(),
	perms: z.string(),
	notes: z.string(),
});

api.post("/updatePerms", requirePermission("write"), async (ctx) => {
	const body = UpdatePerms.parse(await ctx.req.parseBody());
	tokens.setPerms(body.token, {
		read: body.perms == "readwrite" ||
			body.perms == "read" ||
			false,
		write: body.perms == "readwrite" || false,
		notes: body.notes,
	});
	return ctx.redirect("/settings");
});

api.post(
	"/uploadImage",
	requirePermission("write"),
	async (ctx) => {
		const body = await ctx.req.parseBody({ all: true });
		const value = body["image"];
		const files = Array.isArray(value)
			? value.filter((item): item is File => item instanceof File)
			: value instanceof File
			? [value]
			: [];
		try {
			files.forEach((file) => {
				const p = `./public/images/${file.name}`;
				Deno.writeFile(p, file.stream());
				optimiseAsset(p);
			});
			return ctx.redirect("/settings");
		} catch (e) {
			console.error(e);
			return ctx.status(500);
		}
	},
);

const DeleteImage = z.object({
	name: z.string(),
});

api.post("/deleteImage", requirePermission("write"), async (ctx) => {
	const body = DeleteImage.parse(await ctx.req.parseBody());
	try {
		await Deno.remove(`./public/images/${body.name}`);
		return ctx.redirect("/settings");
	} catch (e) {
		ctx.status(500);
		ctx.text((e as Error)?.message);
	}
});

api.post("/createSection", requirePermission("write"), async (ctx) => {
	await journal.addSection();
	return ctx.redirect("/");
});

const SingleSection = z.object({
	id: z.string(),
});

api.post("/sectionUp", requirePermission("write"), async (ctx) => {
	const body = SingleSection.parse(await ctx.req.parseBody());
	await journal.sectionUp(parseInt(body.id));
	return ctx.redirect(`/journal#journal-section-id-${body.id}`);
});

api.post("/sectionDown", requirePermission("write"), async (ctx) => {
	const body = SingleSection.parse(await ctx.req.parseBody());
	await journal.sectionDown(parseInt(body.id));
	return ctx.redirect(`/journal#journal-section-id-${body.id}`);
});

const UpdateSection = z.object({
	id: z.string().transform((n) => parseInt(n)),
	markdown: z.string(),
	title: z.string(),
	date: z.string(),
});

api.post("/updateSection", requirePermission("write"), async (ctx) => {
	const body = UpdateSection.parse(await ctx.req.parseBody());
	journal.updateSection(body.id, {
		markdown: body.markdown,
		title: body.title,
		date: body.date,
	});
	return ctx.redirect(`/journal#journal-section-id-${body.id}`);
});

api.post("/deleteSection", requirePermission("write"), async (ctx) => {
	const body = SingleSection.parse(await ctx.req.parseBody());
	journal.removeSection(parseInt(body.id));
	return ctx.redirect("/journal");
});

api.post("/updateAllSections", requirePermission("write"), async (ctx) => {
	await journal.updateAll();
	return ctx.redirect("/settings");
});

api.get("/downloadBackup", requirePermission("write"), async (ctx) => {
	const archive = archiver("zip", {
		zlib: { level: 3 },
	});

	archive.on("error", (err) => {
		throw err;
	});

	// archive.append(JSON.stringify(journal.getJournal()), {
	// 	name: "journaldb.json",
	// });
	archive.append(JSON.stringify(tokens.getAll()), {
		name: "tokendb.json",
	});
	archive.directory("./public/images/", "/images");
	archive.directory("./public/widgets/", "/widgets");

	archive.finalize();

	return ctx.body(Readable.toWeb(archive), 200, {
		"Content-Type": "application/json",
		"Content-Disposition": "attachment; filename=backup.zip",
	});
});

api.get("/optimiseAllImages", requirePermission("write"), async (ctx) => {
	const files = Deno.readDir(path.resolve("./public/images"));
	for await (const file of files) {
		optimiseAsset(
			path.resolve("./public/images/" + file),
		);
	}
	return ctx.redirect("/settings");
});

api.get("/authenticated", requirePermission("read"), async (ctx) => {
	return ctx.status(200);
});

const pages = new Hono<Env>();
pages.use("*", useTemplate());

pages.get("/index.html", (ctx) => {
	return ctx.redirect("/");
});

pages.get("/", async (ctx) => {
	if (ctx.get("session").get("perms")?.read) ctx.redirect("/journal");
	const session = ctx.get("session");
	return await ctx.render("index.html", {
		metadata: await journal.getMetadata(),
		incorrect: session.get("lastIncorrect") == undefined
			? false
			: session.get("lastIncorrect"),
	});
});

pages.get("/journal", async (ctx) => {
	const session = ctx.get("session");
	if (!session.get("perms")?.read) {
		return ctx.redirect("/");
	}
	return await ctx.render("journal.html", {
		metadata: await journal.getMetadata(),
		sections: await journal.getAll(),
		latestPost: await journal.getLatestSection(),
		perms: session.get("perms"),
	});
});

pages.get("/settings", requirePermission("write"), async (ctx) => {
	const dir = Deno
		.readDirSync("./public/images/")
		.filter((f) => f.isFile);
	const imagesAndTime = dir.map((f) => {
		const stat = Deno.statSync("./public/images/" + f.name);
		return {
			modifiedTimeMs: stat.mtime?.valueOf(),
			name: f.name,
			modifiedDateString: stat.mtime?.toLocaleDateString([
				"en-NZ",
				"en-UK",
				"en-US",
			]),
			modifiedTimeString: stat.mtime?.toLocaleTimeString(),
			size: filesize(stat.size).human("si"),
		};
	}).toArray();
	imagesAndTime.sort((a, b) => {
		if (a.modifiedTimeMs === undefined) return 1;
		if (b.modifiedTimeMs === undefined) return -1;
		return a.modifiedTimeMs - b.modifiedTimeMs;
	});

	return await ctx.render("settings.html", {
		metadata: await journal.getMetadata(),
		images: imagesAndTime,
		tokens: await tokens.getAll(),
		currentToken: ctx.get("session").get("token"),
	});
});

const serveDenoStatic = (fsRoot: string): MiddlewareHandler => {
	return async (c) => {
		return serveDir(c.req.raw, {
			urlRoot: "images/",
			fsRoot,
		});
	};
};

const composedApp = app
	.route("/", pages)
	.route("/api", api)
	.use(
		"/images/*",
		requirePermission("read"),
		serveDenoStatic("./public/images"),
	)
	.use("*", serveStatic({ root: "./public/" }));

Deno.serve({
	port: parseInt(Deno.env.get("PORT_NUMBER")!),
	hostname: "127.0.0.1",
}, composedApp.fetch);
