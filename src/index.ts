import koa from "koa";
import Router from "koa-router";
import serve from "koa-better-serve";
import path from "path";
import archiver from "archiver";
import session from "koa-session";
import koaBody from "koa-body";
import views from "koa-views";
import ratelimit from "koa-ratelimit";
import fs from "fs";
import stream from "stream";
import filesize from "file-size";
import range from "@masx200/koa-range";

import TokenManager from "./tokens";
import JournalManager from "./journal";
import { optimise as optimseAsset } from "./optimiseAssets";

const app = new koa();

const tokens = new TokenManager("./tokendb.json");
const journal = new JournalManager("./journaldb.json");
process.on("SIGINT", () => {
	tokens.writeDB();
	journal.writeDB();
	process.exit(0);
});

//@ts-ignore
app.keys = [journal.getJournal()["cookieKey"]];

app.use(
	session(
		{
			maxAge: 60 * 1000 * 60 * 60 * 24, // two months
		},
		app
	)
);

app.use(
	koaBody({
		multipart: true,
	})
);

const render = views(path.resolve("./views"), {
	map: {
		html: "ejs",
	},
});

// @ts-ignore
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
	//@ts-ignore
	id: (ctx) => ctx.headers["x-forwarded-for"] || ctx.ip,
	max: 5,
	disableHeader: true,
	whitelist: (ctx) => {
		return !!ctx.session?.perms?.read;
	},
});

api.use(apiLimiter);

api.post("/login", (ctx, next) => {
	ctx.status = 200;
	ctx.body = "blah";
	if (ctx.request.body.token != undefined) {
		//console.log("checking perms")
		let perms = tokens.getPerms(ctx.request.body.token);
		if (perms == undefined || !perms.read) {
			ctx.session.lastIncorrect = true;
			ctx.redirect("/");
			return;
		}
		ctx.session.lastIncorrect = false;
		ctx.session.token = ctx.request.body.token;
		ctx.session.perms = perms;
		//console.log("logged in")
		ctx.redirect("/journal");
		return;
	}
});

api.post("/logout", (ctx, next) => {
	ctx.session = null;
	ctx.redirect("/");
});

api.post("/updatePerms", (ctx, next) => {
	if (ctx.request.body != undefined || ctx.session.perms.write) {
		console.log(ctx.request.body);
		tokens.setPerms(ctx.request.body.token, {
			read:
				ctx.request.body.perms == "readwrite" ||
				ctx.request.body.perms == "read" ||
				false,
			write: ctx.request.body.perms == "readwrite" || false,
			notes: ctx.request.body.notes,
		});
		ctx.redirect("/settings");
	}
});

api.post("/uploadImage", (ctx, next) => {
	if (ctx.session?.perms?.write) {
		try {
			let files: any[];
			if (!(ctx.request.files.image instanceof Array)) {
				files = [ctx.request.files.image];
			} else files = ctx.request.files.image;
			files.forEach((file: File) => {
				// @ts-ignore
				const { path, name, type } = file;
				fs.copyFileSync(path, `./public/images/${name}`);
				optimseAsset(path, name);
			});
			ctx.redirect("/settings");
		} catch (e) {
			ctx.status = 500;
			ctx.body = e.message;
		}
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.post("/deleteImage", (ctx, next) => {
	if (ctx.session?.perms?.write) {
		try {
			fs.rmSync(`./public/images/${ctx.request.body.name}`);
			ctx.redirect("/settings");
		} catch (e) {
			ctx.status = 500;
			ctx.body = e.message;
		}
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.post("/createSection", (ctx, next) => {
	if (ctx.session?.perms?.write) {
		journal.addSection();
		ctx.redirect("/");
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.post("/sectionUp", (ctx, next) => {
	if (ctx.session?.perms?.write) {
		const newPos = journal.sectionUp(parseInt(ctx.request.body.id));
		if (newPos != undefined) {
			ctx.redirect(`/journal#journal-section-id-${newPos}`);
		} else ctx.redirect("/journal");
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.post("/sectionDown", (ctx, next) => {
	if (ctx.session?.perms?.write) {
		const newPos = journal.sectionDown(parseInt(ctx.request.body.id));
		if (newPos != undefined) {
			ctx.redirect(`/journal#journal-section-id-${newPos}`);
		} else ctx.redirect("/journal");
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.post("/updateSection", (ctx, next) => {
	if (ctx.session?.perms?.write) {
		journal.updateSection(ctx.request.body.id, {
			markdown: ctx.request.body.markdown,
			title: ctx.request.body.title,
			date: ctx.request.body.date,
		});
		ctx.redirect(`/journal#journal-section-id-${ctx.request.body.id}`);
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.post("/deleteSection", (ctx, next) => {
	if (ctx.session?.perms?.write) {
		journal.removeSection(parseInt(ctx.request.body.id));
		ctx.redirect("/journal");
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.post("/updateAllSections", (ctx, next) => {
	if (ctx.session?.perms?.write) {
		journal.updateAll();
		ctx.redirect("/settings");
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.get("/downloadBackup", (ctx, next) => {
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
		archive.append(JSON.stringify(journal.getJournal()), {
			name: "journaldb.json",
		});
		archive.directory("./public/images/", "/images");

		archive.finalize();

		ctx.status = 200;
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.get("/optimiseAllImages", async (ctx, next) => {
	if (ctx.session?.perms?.write) {
		const files = await fs.promises.readdir(path.resolve("./public/images"), {
			encoding: "utf8",
		});
		for (const file of files) {
			optimseAsset(
				path.resolve("./public/images/" + file),
				path.parse(file).name
			);
		}
		ctx.redirect("/settings");
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.get("/authenticated", async (ctx) => {
	if (ctx.session?.perms?.read) {
		ctx.status = 200;
	} else ctx.status = 403;
});

app.use(api.routes());
//app.use(api.allowedMethods());

const pages = new Router();

pages.get("/index.html", async (ctx, next) => {
	ctx.redirect("/");
});

pages.get("/", async (ctx, next) => {
	if (ctx.session?.perms?.read) ctx.redirect("/journal");
	// @ts-ignore
	await ctx.render("index", {
		journal: journal.getJournal(),
		incorrect:
			ctx.session.lastIncorrect == undefined
				? false
				: ctx.session.lastIncorrect,
	});
});

pages.get("/journal", async (ctx, next) => {
	if (!ctx.session?.perms?.read) {
		ctx.redirect("/");
	}
	// @ts-ignore
	await ctx.render("journal", {
		journal: journal.getJournal(),
		perms: ctx.session?.perms,
	});
});

pages.get("/settings", async (ctx, next) => {
	if (ctx.session?.perms?.write) {
		let dir = fs
			.readdirSync("./public/images/", { withFileTypes: true })
			.filter((f) => {
				return f.isFile();
			});
		let imagesAndTime = dir.map((f) => {
			let stat = fs.statSync("./public/images/" + f.name);
			return [
				stat.mtimeMs,
				[
					f.name,
					new Date(stat.mtimeMs).toLocaleDateString([
						"en-NZ",
						"en-UK",
						"en-US",
					]),
					new Date(stat.mtimeMs).toLocaleTimeString(),
					filesize(stat.size).human("si"),
				],
			];
		});
		imagesAndTime.sort((a: any, b: any) => {
			return a[0] - b[0];
		});
		let images = imagesAndTime.map((i) => i[1]);

		// @ts-ignore
		await ctx.render("settings", {
			journal: journal.getJournal(),
			images: images,
			tokens: tokens.getAll(),
			currentToken: ctx.session.token,
		});
	} else {
		ctx.redirect("/");
	}
});

app.use(pages.routes());
//app.use(pages.allowedMethods());

app.use(range);
app.use(serve(path.resolve("./public"), "/"));

//@ts-ignore
app.listen(journal.getJournal().portNumber, "127.0.0.1");
