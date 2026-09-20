import koa from "koa";
import Router from "@koa/router";
import path from "node:path";
import archiver from "archiver";
import session from "koa-session";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import multer from "@koa/multer";
import views from "@ladjs/koa-views";
import ratelimit from "koa-ratelimit";
import fs from "node:fs";
import stream from "node:stream";
import filesize from "file-size";
import range from "@masx200/koa-range";
import * as z from "zod";

import TokenManager from "./tokens.ts";
import JournalManager from "./journal.ts";
import { optimise as optimseAsset } from "./optimiseAssets.ts";

const app = new koa();

const tokens = new TokenManager();
const journal = new JournalManager();
process.on("SIGINT", () => {
	process.exit(0);
});

const requiredEnv = ["DB_FILE_NAME", "COOKIE_KEY", "PORT_NUMBER"];
requiredEnv.forEach((v) => {
	if (!Deno.env.has(v)) throw new Error(`Environment variable ${v} was empty`);
});

app.keys = [Deno.env.get("COOKIE_KEY")!];

app.use(
	session(
		{
			maxAge: 60 * 1000 * 60 * 60 * 24, // two months
		},
		app,
	),
);

app.use(bodyParser({}));

const upload = multer({
	dest: Deno.makeTempDirSync(),
	// TODO: Make sure filenames are encoded with utf8
});

const render = views(path.resolve("./views"), {
	map: {
		html: "ejs",
	},
});

app.use(render);

const api = new Router({
	prefix: "/api",
});

const ratelimitDb = new Map();

const apiLimiter = ratelimit({
	driver: "memory",
	db: ratelimitDb,
	duration: 1000 * 60 * 60 * 2, // 2 hours
	errorMessage: "Too many API requests from this IP address. Try again later.",
	id: (ctx) => (ctx.headers["x-forwarded-for"] ?? ctx.ip).toString(),
	max: 5,
	disableHeader: true,
	whitelist: (ctx) => {
		return !!ctx.session?.perms?.read;
	},
});

api.use(apiLimiter);

const Login = z.object({
	token: z.string(),
});

api.post("/login", async (ctx) => {
	ctx.status = 200;
	const body = Login.parse(ctx.request.body);
	if (body.token != undefined) {
		//console.log("checking perms")
		const perms = await tokens.getPerms(body.token);
		if (perms == undefined || !perms.read) {
			ctx.session.lastIncorrect = true;
			ctx.redirect("/");
			return;
		}
		ctx.session.lastIncorrect = false;
		ctx.session.token = body.token;
		ctx.session.perms = perms;
		//console.log("logged in")
		ctx.redirect("/journal");
		return;
	}
});

api.post("/logout", (ctx) => {
	ctx.session = null;
	ctx.redirect("/");
});

const UpdatePerms = z.object({
	token: z.string(),
	perms: z.string(),
	notes: z.string(),
});

api.post("/updatePerms", (ctx) => {
	const body = UpdatePerms.parse(ctx.request.body);
	if (ctx.request.body != undefined && ctx.session.perms.write) {
		tokens.setPerms(body.token, {
			read: body.perms == "readwrite" ||
				body.perms == "read" ||
				false,
			write: body.perms == "readwrite" || false,
			notes: body.notes,
		});
		ctx.redirect("/settings");
	}
});

api.post(
	"/uploadImage",
	upload.fields([
		{
			name: "image",
		},
	]),
	(ctx) => {
		if (ctx.session?.perms?.write) {
			if (ctx.request.files === undefined) return; // TODO: flesh out
			const files = (ctx.request.files instanceof Array)
				? ctx.request.files
				: Object.values(ctx.request.files).flatMap((f) => f);
			try {
				files.forEach((file) => {
					const { path, originalname } = file;
					fs.copyFileSync(path, `./public/images/${originalname}`);
					optimseAsset(path, originalname);
				});
				ctx.redirect("/settings");
			} catch (e) {
				console.error(e);
				ctx.status = 500;
				ctx.body = (e as Error)?.message;
			}
		} else {
			ctx.status = 403;
			ctx.body = "Forbidden";
		}
	},
);

const DeleteImage = z.object({
	name: z.string(),
});

api.post("/deleteImage", (ctx) => {
	const body = DeleteImage.parse(ctx.request.body);
	if (ctx.session?.perms?.write) {
		try {
			fs.rmSync(`./public/images/${body.name}`);
			ctx.redirect("/settings");
		} catch (e) {
			ctx.status = 500;
			ctx.body = (e as Error)?.message;
		}
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.post("/createSection", async (ctx) => {
	if (ctx.session?.perms?.write) {
		await journal.addSection();
		ctx.redirect("/");
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

const SingleSection = z.object({
	id: z.string(),
});

api.post("/sectionUp", async (ctx) => {
	const body = SingleSection.parse(ctx.request.body);
	if (ctx.session?.perms?.write) {
		await journal.sectionUp(parseInt(body.id));
		ctx.redirect(`/journal#journal-section-id-${body.id}`);
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.post("/sectionDown", async (ctx) => {
	const body = SingleSection.parse(ctx.request.body);
	if (ctx.session?.perms?.write) {
		await journal.sectionDown(parseInt(body.id));
		ctx.redirect(`/journal#journal-section-id-${body.id}`);
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

const UpdateSection = z.object({
	id: z.string().transform((n) => parseInt(n)),
	markdown: z.string(),
	title: z.string(),
	date: z.string(),
});

api.post("/updateSection", (ctx) => {
	const body = UpdateSection.parse(ctx.request.body);
	if (ctx.session?.perms?.write) {
		journal.updateSection(body.id, {
			markdown: body.markdown,
			title: body.title,
			date: body.date,
		});
		ctx.redirect(`/journal#journal-section-id-${body.id}`);
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.post("/deleteSection", (ctx) => {
	const body = SingleSection.parse(ctx.request.body);
	if (ctx.session?.perms?.write) {
		journal.removeSection(parseInt(body.id));
		ctx.redirect("/journal");
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.post("/updateAllSections", (ctx) => {
	if (ctx.session?.perms?.write) {
		journal.updateAll();
		ctx.redirect("/settings");
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.get("/downloadBackup", (ctx) => {
	if (ctx.session?.perms?.write) {
		const archive = archiver("zip", {
			zlib: { level: 3 },
		});

		archive.on("error", (err) => {
			throw err;
		});

		ctx.type = "application/zip";
		ctx.attachment("backup.zip");

		const s = new stream.PassThrough();
		ctx.body = s;

		archive.pipe(s);
		// archive.append(JSON.stringify(journal.getJournal()), {
		// 	name: "journaldb.json",
		// });
		// archive.append(JSON.stringify(tokens.getAll()), {
		// 	name: "tokendb.json",
		// });
		archive.directory("./public/images/", "/images");

		archive.finalize();

		ctx.status = 200;
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.get("/optimiseAllImages", async (ctx) => {
	if (ctx.session?.perms?.write) {
		const files = await fs.promises.readdir(path.resolve("./public/images"), {
			encoding: "utf8",
		});
		for (const file of files) {
			optimseAsset(
				path.resolve("./public/images/" + file),
				path.parse(file).name,
			);
		}
		ctx.redirect("/settings");
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.get("/authenticated", (ctx) => {
	if (ctx.session?.perms?.read) {
		ctx.status = 200;
	} else ctx.status = 403;
});

app.use(api.routes());
//app.use(api.allowedMethods());

const pages = new Router();

pages.get("/index.html", (ctx, next) => {
	ctx.redirect("/");
});

pages.get("/", async (ctx) => {
	if (ctx.session?.perms?.read) ctx.redirect("/journal");
	await ctx.render("index", {
		metadata: await journal.getMetadata(),
		incorrect: ctx.session.lastIncorrect == undefined
			? false
			: ctx.session.lastIncorrect,
	});
});

pages.get("/journal", async (ctx) => {
	if (!ctx.session?.perms?.read) {
		ctx.redirect("/");
	}
	await ctx.render("journal", {
		metadata: await journal.getMetadata(),
		sections: await journal.getAll(),
		latestPost: await journal.getLatestSection(),
		perms: ctx.session?.perms,
	});
});

pages.get("/settings", async (ctx) => {
	if (ctx.session?.perms?.write) {
		const dir = fs
			.readdirSync("./public/images/", { withFileTypes: true })
			.filter((f) => {
				return f.isFile();
			});
		const imagesAndTime = dir.map((f) => {
			const stat = fs.statSync("./public/images/" + f.name);
			return {
				modifiedTimeMs: stat.mtimeMs,
				name: f.name,
				modifiedDateString: new Date(stat.mtimeMs).toLocaleDateString([
					"en-NZ",
					"en-UK",
					"en-US",
				]),
				modifiedTimeString: new Date(stat.mtimeMs).toLocaleTimeString(),
				size: filesize(stat.size).human("si"),
			};
		});
		imagesAndTime.sort((a, b) => {
			return a.modifiedTimeMs - b.modifiedTimeMs;
		});

		await ctx.render("settings", {
			metadata: await journal.getMetadata(),
			images: imagesAndTime,
			tokens: await tokens.getAll(),
			currentToken: ctx.session.token,
		});
	} else {
		ctx.redirect("/");
	}
});

app.use(pages.routes());
//app.use(pages.allowedMethods());

app.use(range);
app.use(serve(path.resolve("./public")));

app.listen(parseInt(Deno.env.get("PORT_NUMBER")!), "127.0.0.1");
