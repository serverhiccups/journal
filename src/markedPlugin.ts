const renderer = {
	image(href: string, title: string | null , text: string) {
		 return `
			<figure class="img-container">
				<img src="${href}" alt="title">
				${title != null ? `<figcaption>${title}</figcaption>` : ""}
			</figure>
		 `;
	}
}

export default renderer;
