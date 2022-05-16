document.addEventListener("DOMContentLoaded", () => {
	/** @type {HTMLFormElement} */
	const form = document.querySelector("#image-upload");
	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		const data = new FormData(form);
		const x = new XMLHttpRequest();

		/** @type {HTMLDivElement} */
		let el = null;

		x.upload.addEventListener("loadstart", () => {
			el = document.createElement("div");
			form.insertAdjacentElement("afterend", el);
		});

		x.upload.addEventListener("progress", (progress) => {
			if (!progress.lengthComputable) {
				el.innerHTML = "Unknown time remaining...";
				return;
			}
			el.innerText = `${Math.floor(
				(progress.loaded * 100) / progress.total
			)}% completed.`;
		});

		x.upload.addEventListener("loadend", () => {
			el.remove();
			el = null;
		});

		x.onreadystatechange = (res) => {
			if (x.readyState == x.DONE) {
				if (x.status == 200) {
					location.reload();
				}
				window.alert(`ERROR: ${x.status}: ${x.statusText}`);
			}
		};

		x.open("POST", form.action, true);

		x.send(data);
	});
});
