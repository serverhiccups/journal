/**
 * @param element Element
 **/
async function errorWidget(element, widgetProps) {
	element.innerHTML = "❌ An error occured while loading this widget"
}

document.addEventListener("DOMContentLoaded", async () => {
	const widgetElements = Array.from(document.querySelectorAll("div.widget"));
	const widgetNames = widgetElements.map((widgetEl) => {
		return widgetEl.id
	})
	widgetElements.forEach((el) => {
		el.innerHTML = "♻️ This widget is currently loading";
	})
	const uniqueWidgetNames = [...new Set(widgetNames)];
	uniqueWidgetNames.forEach(async (wname) => {
		try {
			let sheet = document.createElement("link");
			sheet.type = "text/css";
			sheet.rel = "stylesheet";
			sheet.href = `js/widgets/${wname}.css`;
			document.head.appendChild(sheet);

			const {default: widgetExport} = await import("/js/widgets/" + wname + ".js");
			widgetElements.forEach((el) => {
				if(el.id == wname) {
					el.innerHTML = "";
					widgetExport(el, el.dataset);
				}
			})
		} catch (e) {
			console.dir(e);
			errorWidget(el, el.dataset);
		}
	})
})
