document.addEventListener("DOMContentLoaded", () => {
	const canvas = document.getElementById("journal-decoration");

	function randomTree() {
		let num = Math.floor(Math.random() * 100);
		if(num < 10) return "🌳";
		return "🌲";
	}

	function createTree(x, y, str) {
		let el = document.createElement("span");
		el.innerHTML = str;
		el.className = "journal-tree";
		//el.style.transform = `translate(${x*100}%, ${y*100}%)`;
		el.style.top = `calc(${y} * (100% - 2rem))`
		el.style.left = `calc(${x} * (100% - 2rem))`
		return el;
	}

	for(let i = 0; i < 100; i++) {
	canvas.append(createTree(Math.random(), Math.random(), randomTree()))
	}
});
