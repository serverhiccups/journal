document.addEventListener("DOMContentLoaded", () => {
	document.querySelectorAll(".journal-button-edit").forEach((button) => {
		button.addEventListener("click", (e) => {
			let html = e.target.parentNode.childNodes[5].childNodes[1];
			let markdown = e.target.parentNode.childNodes[5].childNodes[3];
			const style = getComputedStyle(html);
			if(style.display == "none") { // The markdown editor is showing
				html.style.display = "block"
				markdown.style.display = "none";
			} else { // The html is showing
				html.style.display = "none";
				markdown.style.display = "grid";
			}
		});
	});
});
