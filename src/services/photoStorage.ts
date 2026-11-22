import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client
} from "@aws-sdk/client-s3"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { publicUrl, uploadsDir } from "../constants.js"

export const uploadsRoot = path.resolve(uploadsDir)

const spacesRegion = process.env.SPACES_REGION || "fra1"
const spacesBucket = process.env.SPACES_BUCKET_NAME
// All photos are stored under this prefix in the bucket
const spacesPrefix = "tripletoy/photos"

// The photos are stored in DigitalOcean Spaces if it is configured, otherwise in UPLOADS_DIR.
// The local directory is only meant for development, the file system of App Platform is lost
// on every deploy.
const s3Client =
	spacesBucket && process.env.SPACES_ACCESS_KEY && process.env.SPACES_SECRET_KEY
		? new S3Client({
				endpoint: `https://${spacesRegion}.digitaloceanspaces.com`,
				forcePathStyle: false,
				region: spacesRegion,
				credentials: {
					accessKeyId: process.env.SPACES_ACCESS_KEY,
					secretAccessKey: process.env.SPACES_SECRET_KEY
				}
			})
		: null

if (s3Client == null) {
	console.warn(
		`DigitalOcean Spaces is not configured, photos are stored locally in ${uploadsRoot}`
	)
}

const contentTypes: Record<string, string> = {
	jpg: "image/jpeg",
	png: "image/png",
	webp: "image/webp"
}

// The file names come from the database, basename guards against path traversal anyway
function getKey(fileName: string) {
	return `${spacesPrefix}/${path.basename(fileName)}`
}

/** Url of the photo for the clients, relative to the API if the photo is stored locally */
export function getPhotoUrl(fileName: string) {
	if (s3Client == null) return `/photos/${path.basename(fileName)}`
	return `https://${spacesBucket}.${spacesRegion}.cdn.digitaloceanspaces.com/${getKey(fileName)}`
}

/** Absolute url of the photo, e.g. for the product image in the checkout */
export function getAbsolutePhotoUrl(fileName: string) {
	const url = getPhotoUrl(fileName)
	return url.startsWith("/") ? publicUrl + url : url
}

/** Stores a photo, the file name must end with jpg, png or webp */
export async function storePhoto(fileName: string, data: Buffer) {
	if (s3Client == null) {
		await mkdir(uploadsRoot, { recursive: true })
		await writeFile(path.join(uploadsRoot, path.basename(fileName)), data)
		return
	}

	await s3Client.send(
		new PutObjectCommand({
			Bucket: spacesBucket,
			Key: getKey(fileName),
			Body: data,
			ACL: "public-read",
			ContentType: contentTypes[path.extname(fileName).slice(1)],
			// The file names are random uuids, a file never changes
			CacheControl: "public, max-age=31536000, immutable"
		})
	)
}

/** Reads a stored photo */
export async function readPhoto(fileName: string): Promise<Buffer> {
	if (s3Client == null) {
		return await readFile(path.join(uploadsRoot, path.basename(fileName)))
	}

	const response = await s3Client.send(
		new GetObjectCommand({ Bucket: spacesBucket, Key: getKey(fileName) })
	)
	return Buffer.from(await response.Body.transformToByteArray())
}

/** Removes stored photo files, files that are already gone are ignored */
export async function deletePhotoFiles(fileNames: string[]) {
	for (const fileName of fileNames) {
		try {
			if (s3Client == null) {
				await unlink(path.join(uploadsRoot, path.basename(fileName)))
			} else {
				// Deleting an object that does not exist succeeds in S3
				await s3Client.send(
					new DeleteObjectCommand({ Bucket: spacesBucket, Key: getKey(fileName) })
				)
			}
		} catch (error) {
			if (error?.code != "ENOENT") console.error(error)
		}
	}
}
