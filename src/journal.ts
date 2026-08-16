import { marked } from "marked";
import { galleryExtension, imageRenderer } from "./markedPlugin.ts";
import { asc, count, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { journalTable, sections } from "./db/schema.ts";

marked.use({
	renderer: imageRenderer,
});

marked.use({ extensions: [galleryExtension] });

interface Section {
	title: string;
	date: string;
	markdown: string;
}

export type JournalMetadata = typeof journalTable.$inferSelect;

export default class JournalManager {
	constructor() {
	}

	async getMetadata(): Promise<JournalMetadata> {
		const metadata = await db.query.journalTable.findFirst();
		if (metadata === undefined) throw new Error("No metadata in the db");
		return metadata;
	}

	async addSection() {
		const [{ numberOfRows }] = await db
			.select({ numberOfRows: count() })
			.from(sections);
		await db.insert(sections).values({
			date: "",
			title: "",
			markdown: "",
			html: "",
			position: numberOfRows,
		});
	}

	async updateSection(sectionId: number, section: Section): Promise<number> {
		await db.update(sections).set({
			...section,
			html: marked(section.markdown, { async: false }),
		}).where(eq(sections.id, sectionId));
		return sectionId;
	}

	async getSection(sectionId: number) {
		return await db.query.sections.findFirst({ where: { id: sectionId } });
	}

	async getLatestSection() {
		const [section] = await db
			.select()
			.from(sections)
			.orderBy(desc(sections.position))
			.limit(1);
		return section;
	}

	async removeSection(sectionId: number): Promise<void> {
		await db.transaction(async (tx) => {
			const [section] = await tx
				.select({
					id: sections.id,
					position: sections.position,
				})
				.from(sections)
				.where(eq(sections.id, sectionId));

			if (!section) throw new Error("could not find section to delete");

			await tx.delete(sections).where(eq(sections.id, section.id));

			await tx.update(sections)
				.set({ position: sql`${sections.position} - 1` })
				.where(gt(sections.position, section.position));
		});
	}

	async sectionUp(sectionId: number): Promise<void> {
		await db.transaction(async (tx) => {
			const [section] = await tx
				.select({
					id: sections.id,
					position: sections.position,
				})
				.from(sections)
				.where(eq(sections.id, sectionId));

			if (section.position == 0) return;
			const [sectionAbove] = await tx
				.select({
					id: sections.id,
					position: sections.position,
				})
				.from(sections)
				.where(eq(sections.position, section.position - 1));

			await tx.update(sections)
				.set({ position: section.position - 1 })
				.where(eq(sections.id, section.id));

			await tx.update(sections)
				.set({ position: sectionAbove.position + 1 })
				.where(eq(sections.id, sectionAbove.id));
		});
	}

	async sectionDown(sectionId: number): Promise<void> {
		await db.transaction(async (tx) => {
			const [section] = await tx
				.select({
					id: sections.id,
					position: sections.position,
				})
				.from(sections)
				.where(eq(sections.id, sectionId));

			const [sectionBelow] = await tx
				.select({
					id: sections.id,
					position: sections.position,
				})
				.from(sections)
				.where(eq(sections.position, section.position + 1));
			if (!sectionBelow) return;

			await tx.update(sections)
				.set({ position: section.position + 1 })
				.where(eq(sections.id, section.id));

			await tx.update(sections)
				.set({ position: sectionBelow.position - 1 })
				.where(eq(sections.id, sectionBelow.id));
		});
	}

	async getAll() {
		return await db.select().from(sections).orderBy(asc(sections.position))
			.all();
	}

	async updateAll() {
		await db.transaction(async (tx) => {
			const rows = await tx.select().from(sections);

			for (const row of rows) {
				await tx
					.update(sections)
					.set({ html: await marked(row.markdown) })
					.where(eq(sections.id, row.id));
			}
		});
	}
}
