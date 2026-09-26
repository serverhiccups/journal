import sharp from "sharp";
import { parse } from "node:path";
import fs from "node:fs";

export async function optimise(path: string) {
	const name = parse(path).name;
	try {
		const image = sharp(path);
		const metadata = await image.metadata();
		if (
			fs.existsSync("./public/images/optimised/" + name + ".jpeg")
		) {
			fs.rmSync("./public/images/optimised/" + name + ".jpeg");
		}
		await image
			.withMetadata({
				orientation: metadata.orientation,
			})
			.resize({
				width: 1200,
			})
			.jpeg({
				progressive: true,
				mozjpeg: true,
			})
			.toFile("./public/images/optimised/" + name + ".jpeg");
	} catch (err) {
		console.log(err);
	}
}
