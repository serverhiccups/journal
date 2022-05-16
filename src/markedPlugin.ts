import imageSize from "probe-image-size";
import { readFileSync, existsSync } from "fs";
import { resolve, parse } from "path";

const imageRenderer = {
	image(href: string, title: string | null, text: string) {
		let sizeHints = {
			width: null,
			height: null,
		};
		if (href.startsWith("images/")) {
			// is probably a local file?
			try {
				const newName =
					"./public/images/optimised/" +
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
			<figure class="img-container">
				<img loading="lazy" src="${href}" alt="${title}" ${
			sizeHints.width ? 'width="' + sizeHints.width + '"' : ""
		} ${sizeHints.height ? 'height="' + sizeHints.height + '"' : ""}>
				${title != null ? `<figcaption>${title}</figcaption>` : ""}
			</figure>
		 `;
	},
};

const galleryExtension = {
	name: "gallery",
	level: "block",
	start(src: string) {
		return src.match(/^\$\$/)?.index;
	},
	tokenizer(src: string, tokens: Array<any>) {
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
	renderer(token: any) {
		return `
		<div class="image-gallery">
		${token.tokens
			.filter((t) => {
				return t.type == "image";
			})
			.map((i) => {
				return `
			<div class="image-gallery-slide">
				<img loading="lazy" src="${i.href}" ${i.title ? 'alt="${i.title}"' : ""}">
				${i.title ? `<span>${i.title}</span>` : ""}
			</div>
			`;
			})
			.join("")}
		</div>
		`;
	},
};

export { imageRenderer, galleryExtension };
