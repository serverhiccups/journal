import fs from "fs";
import marked from "marked";
import { imageRenderer, galleryExtension } from "./markedPlugin";

marked.use({
	renderer: imageRenderer
});

marked.use({extensions: [galleryExtension]});

interface Journal {
	title: string;
	contact: string;
	sections: RenderedSection[];
}

interface RenderedSection {
	title?: string;
	date?: string;
	markdown: string;
	html: string;
}

interface Section {
	title?: string;
	date?: string;
	markdown: string;
}

export default class JournalManager {
	dbPath: string;
	db: Journal;

	constructor(dbPath: string) {
		this.dbPath = dbPath;
		this.readDB();
	}

	readDB() {
		this.db = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'))
	}

	writeDB() {
		fs.writeFileSync(this.dbPath, JSON.stringify(this.db));
	}

	addSection() {
		this.updateSection(this.db.sections.length, {
			markdown: ""
		})
	}

	updateSection(sectionId: number, section: Section): number {
		this.db.sections[sectionId] = {...section, html: marked(section.markdown)};
		return sectionId;
	}

	getSection(sectionId: number): RenderedSection {
		return this.db.sections[sectionId];
	}

	removeSection(sectionId: number): RenderedSection {
		//console.log("Removing not id: " + sectionId)
		return this.db.sections.splice(sectionId, 1)[0];
	}

	sectionUp(sectionId: number): number {
		if(sectionId < 0 || sectionId > this.db.sections.length - 1) return;
		if(sectionId == 0) return; // Can't move an item at the top up.
		// Swap the elements
		[this.db.sections[sectionId], this.db.sections[sectionId - 1]] = [this.db.sections[sectionId - 1], this.db.sections[sectionId]]
		return sectionId - 1;
	}

	sectionDown(sectionId: number): number {
		if(sectionId < 0 || sectionId > this.db.sections.length - 1) return;
		if(sectionId == this.db.sections.length - 1) return; // Can't move an item at the bottom down.
		// Swap the elements
		[this.db.sections[sectionId], this.db.sections[sectionId + 1]] = [this.db.sections[sectionId + 1], this.db.sections[sectionId]]
		return sectionId + 1;
	}

	getAll(): RenderedSection[] {
		return this.db.sections;
	}

	getJournal(): Journal {
		return this.db;
	}
}
