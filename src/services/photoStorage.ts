import { unlink } from "node:fs/promises"
import path from "node:path"
import { uploadsDir } from "../constants.js"

export const uploadsRoot = path.resolve(uploadsDir)

/** Removes stored photo files, files that are already gone are ignored */
export async function deletePhotoFiles(fileNames: string[]) {
	for (const fileName of fileNames) {
		try {
			// The file names come from the database, basename guards against path traversal anyway
			await unlink(path.join(uploadsRoot, path.basename(fileName)))
		} catch (error) {
			if (error?.code != "ENOENT") console.error(error)
		}
	}
}
