import koa from "koa";
import Router from "koa-router";
import serve from "koa-static";
import path from "path";
import session from "koa-session";
import koaBody from "koa-body";
import views from "koa-views";
import ratelimit from "koa-ratelimit";
import fs from "fs";

import TokenManager from "./tokens";
import JournalManager from "./journal";

const app = new koa();

const tokens = new TokenManager("./tokendb.json")
const journal = new JournalManager("./journaldb.json")
process.on("SIGINT", () => {
	tokens.writeDB();
	journal.writeDB();
	process.exit(0);
})

//@ts-ignore
app.keys = [ journal.getJournal()["cookieKey"] ]

app.use(session({
	maxAge: 60 * 1000 * 60 * 60 * 24 // two months
}, app));

app.use(koaBody({
	multipart: true
}));

const render = views(path.resolve('./views'), {
	map: {
		html: "ejs"
	}
})

// @ts-ignore
app.use(render);

const api = new Router({
	prefix: "/api"
});

const ratelimitDb = new Map();

const apiLimiter = ratelimit({
	driver: 'memory',
	db: ratelimitDb,
	duration: 1000 * 60 * 60 * 2, // 2 hours
	errorMessage: "Too many API requests from this IP address. Try again later.",
	id: (ctx) => ctx.ip,
	max: 5,
	disableHeader: true,
	whitelist: (ctx) => {
		return !!ctx.session?.perms?.read;
	}
})

api.use(apiLimiter);

api.post("/login", (ctx, next) => {
	ctx.status= 200;
	ctx.body = "blah"
	if(ctx.request.body.token != undefined) {
		//console.log("checking perms")
		let perms = tokens.getPerms(ctx.request.body.token);
		if(perms == undefined || !perms.read) {
			ctx.session.lastIncorrect = true;
			ctx.redirect("/");
			return;
		}
		ctx.session.lastIncorrect = false;
		ctx.session.token = ctx.request.body.token
		ctx.session.perms = perms;
		//console.log("logged in")
		ctx.redirect("/journal")
		return;
	}
})

api.post("/logout", (ctx, next) => {
	ctx.session = null;
	ctx.redirect("/");
})

api.post("/updatePerms", (ctx, next) => {
	if(ctx.request.body != undefined || ctx.session.perms.write) {
		console.log(ctx.request.body);
		tokens.setPerms(ctx.request.body.token, {
			read: ctx.request.body.perms == "readwrite" || ctx.request.body.perms == "read" || false,
			write: ctx.request.body.perms == "readwrite" || false,
			notes: ctx.request.body.notes
		})
		ctx.redirect("/settings");
	}
})

api.post("/uploadImage", (ctx, next) => {
	if(ctx.session?.perms?.write) {
		try {
			// @ts-ignore
			const {path, name, type} = ctx.request.files.image;
			fs.copyFileSync(path, `./public/images/${name}`);
			ctx.redirect("/settings");
		} catch (e) {
			ctx.status = 500;
			ctx.body = e.message;
		}
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
})

api.post("/deleteImage", (ctx, next) => {
	if(ctx.session?.perms?.write) {
		try {
			fs.rmSync(`./public/images/${ctx.request.body.name}`);
			ctx.redirect("/settings");
		} catch (e) {
			ctx.status = 500
			ctx.body = e.message;
		}
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
})

api.post("/createSection", (ctx, next) => {
	if(ctx.session?.perms?.write) {
		journal.addSection();
		ctx.redirect("/")
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
});

api.post("/sectionUp", (ctx, next) => {
	if(ctx.session?.perms?.write) {
		const newPos = journal.sectionUp(parseInt(ctx.request.body.id));
		if(newPos != undefined) {
			ctx.redirect(`/journal#journal-section-id-${newPos}`);
		} else ctx.redirect("/journal");
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden"
	}
});

api.post("/sectionDown", (ctx, next) => {
	if(ctx.session?.perms?.write) {
		const newPos = journal.sectionDown(parseInt(ctx.request.body.id));
		if(newPos != undefined) {
			ctx.redirect(`/journal#journal-section-id-${newPos}`);
		} else ctx.redirect("/journal");
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden"
	}
})

api.post("/updateSection", (ctx, next) => {
	if(ctx.session?.perms?.write) {
		journal.updateSection(ctx.request.body.id, {
			markdown: ctx.request.body.markdown,
			title: ctx.request.body.title,
			date: ctx.request.body.date
		});
		ctx.redirect(`/journal#journal-section-id-${ctx.request.body.id}`)
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
})

api.post("/deleteSection", (ctx, next) => {
	if(ctx.session?.perms?.write) {
		journal.removeSection(parseInt(ctx.request.body.id));
		ctx.redirect("/journal");
	} else {
		ctx.status = 403;
		ctx.body = "Forbidden";
	}
})

app.use(api.routes());
//app.use(api.allowedMethods());

const pages = new Router();

pages.get("/index.html", async (ctx, next) => {
	ctx.redirect("/")
})

pages.get("/", async (ctx, next) => {
	if(ctx.session?.perms?.read) ctx.redirect("/journal")
	// @ts-ignore
	await ctx.render("index", {
		journal: journal.getJournal(),
		incorrect: ctx.session.lastIncorrect == undefined ? false : ctx.session.lastIncorrect
	})
})

pages.get("/journal", async (ctx, next) => {
	if(!ctx.session?.perms?.read) {
		ctx.redirect("/");
	}
	// @ts-ignore
	await ctx.render("journal", {
		journal: journal.getJournal(),
		perms: ctx.session?.perms
	})
})

pages.get('/settings', async (ctx, next) => {
	if(ctx.session?.perms?.write) {
		let images = fs.readdirSync("./public/images/").map((file) => file.toString());
		// @ts-ignore
		await ctx.render("settings", {
			journal: journal.getJournal(),
			images: images,
			tokens: tokens.getAll(),
			currentToken: ctx.session.token

		});
	} else {
		ctx.redirect("/");
	}
})

app.use(pages.routes());
//app.use(pages.allowedMethods());

app.use(serve(path.resolve("./public")));

app.listen(8080, "127.0.0.1");
