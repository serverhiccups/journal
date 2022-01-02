const imageRenderer = {
	image(href: string, title: string | null, text: string) {
		return `
			<figure class="img-container">
				<img loading="lazy" src="${href}" alt="title">
				${title != null ? `<figcaption>${title}</figcaption>` : ""}
			</figure>
		 `;
	}
}

const galleryExtension = {
	name: "gallery",
	level: 'block',
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
				tokens: []
			}
			token.text.split("\n").forEach((i) => {
				this.lexer.inline(i, token.tokens);
			})
			return token;
		}
	},
	renderer(token: any) {
		return `
		<div class="image-gallery">
		${token.tokens.filter((t) => {
			return t.type == "image"
		}).map((i) => {
			return `
			<div class="image-gallery-slide">
				<img loading="lazy" src="${i.href}" ${i.title ? 'alt="${i.title}"' : ""}">
				${i.title ? `<span>${i.title}</span>` : ""}
			</div>
			`
		}).join("")}
		</div>
		`
	}
}

export { imageRenderer, galleryExtension }