import sharp from "sharp";
import { parse } from "path";
import fs from "fs";

export async function optimise(path: string, name: string) {
	try {
		const image = sharp(path);
		const metadata = await image.metadata();
		if (
			fs.existsSync("./public/images/optimised/" + parse(name).name + ".jpeg")
		) {
			fs.rmSync("./public/images/optimised/" + parse(name).name + ".jpeg");
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
			.toFile("./public/images/optimised/" + parse(name).name + ".jpeg");
	} catch (err) {}
}
