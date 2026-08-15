import imageSize from "probe-image-size";
import { existsSync, readFileSync } from "fs";
import { parse, resolve } from "path";
import {
	RendererObject,
	TokenizerAndRendererExtension,
	type Tokens,
} from "marked";

const imageRenderer = {
	// image(
	// 	href: string,
	// 	title: string | null,
	// 	text?: string,
	// 	noContainer: boolean = false,
	// ) {
	image(
		token: Tokens.Image,
	) {
		let { href, title } = token;
		const noContainer = false;
		let sizeHints: {
			width: number | null;
			height: number | null;
		} = {
			width: null,
			height: null,
		};
		if (href.startsWith("images/")) {
			// is probably a local file?
			try {
				const newName = "./public/images/optimised/" +
					parse(decodeURIComponent(href).replace(/^(images\/)/, "")).name +
					".jpeg";
				let f = null;
				if (existsSync(newName)) {
					f = readFileSync(resolve(newName));
					href = newName.substring(9);
				} else {
					f = readFileSync(resolve("./public/" + decodeURIComponent(href)));
				}
				const info = imageSize.sync(f);
				if (info === null) throw new Error("could not read image size");
				if (info.orientation && info.orientation < 5) {
					sizeHints.width = info.width;
					sizeHints.height = info.height;
				} else {
					// image is rotated;
					sizeHints.width = info.height;
					sizeHints.height = info.width;
				}
			} catch (err) {
				console.error("oh noes!"); // TODO: replace with a div on the generated page
				console.error(err);
			}
		}
		return `
			${noContainer ? "" : '<figure class="img-container"'}>
				<img loading="lazy" src="${href}" alt="${title}" ${
			sizeHints.width ? 'width="' + sizeHints.width + '"' : ""
		} ${sizeHints.height ? 'height="' + sizeHints.height + '"' : ""}>
				${
			title != null && !noContainer ? `<figcaption>${title}</figcaption>` : ""
		}
			${noContainer ? "" : "</figure>"}
		 `;
	},
};

interface GalleryToken extends Tokens.Generic {
	type: "gallery";
	tokens: Tokens.Generic[];
}

const galleryExtension: TokenizerAndRendererExtension = {
	name: "gallery",
	level: "block" as const,
	start(src: string) {
		return src.match(/^\$\$/)?.index;
	},
	tokenizer(src) {
		const rule = /^(?:\$\$)\n+((.|\n)*?)(?:\$\$)+/;
		const match = rule.exec(src);
		if (match) {
			const token = {
				type: "gallery",
				raw: match[0],
				text: match[1].trim(),
				tokens: [],
			};
			token.text.split("\n").forEach((i) => {
				this.lexer.inline(i, token.tokens);
			});
			return token;
		}
	},
	renderer(token) {
		const gallery = token as GalleryToken;
		return `
		<div class="image-gallery">
		${
			gallery.tokens
				.filter((t): t is Tokens.Image => {
					return t.type == "image";
				})
				.map((i) => {
					return `
			<div class="image-gallery-slide">
				${imageRenderer.image(i)}
				${i.title ? `<span>${i.title}</span>` : ""}
			</div>
			`;
				})
				.join("")
		}
		</div>
		`;
	},
};

export { galleryExtension, imageRenderer };
