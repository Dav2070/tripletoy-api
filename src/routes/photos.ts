import express from "express"
import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { TableObjectsController } from "dav-js"
import { retrieveUserByAccessToken } from "../services/userService.js"
import { invalidateCache } from "../services/cachingService.js"
import { deletePhotoFiles, uploadsRoot } from "../services/photoStorage.js"
import { apiErrors } from "../errors.js"
import {
	drawingMaxBytes,
	drawingMaxCount,
	drawingTableId,
	toyPhotoMaxBytes,
	toyPhotoMaxCount
} from "../constants.js"
import type { ApiError } from "../types.js"
import type { AppDependencies } from "../appDependencies.js"
import { sendDrawingUploadedEmail } from "../services/emailService.js"

const photoContentTypes = ["image/jpeg", "image/png", "image/webp"]

/** Determines the file extension from the magic bytes, null if not a supported image */
function detectImageExtension(data: Buffer): string | null {
	if (data.length > 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff)
		return "jpg"

	if (
		data.length > 8 &&
		data
			.subarray(0, 8)
			.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
	)
		return "png"

	if (
		data.length > 12 &&
		data.toString("ascii", 0, 4) == "RIFF" &&
		data.toString("ascii", 8, 12) == "WEBP"
	)
		return "webp"

	return null
}

function sendError(res: express.Response, error: ApiError) {
	res.status(error.status ?? 500).json({
		code: error.code,
		message: error.message
	})
}

// Serves the stored photos at /photos/<fileName> and accepts uploads at
// POST /toys/:uuid/photos. The body is the raw image, the Content-Type header
// is the image type and the Authorization header the dav access token.
export function createPhotosRouter(dependencies: AppDependencies) {
	const router = express.Router()
	const root = uploadsRoot

	router.use(
		"/photos",
		express.static(root, {
			index: false,
			fallthrough: false,
			maxAge: "30d",
			immutable: true,
			setHeaders: res => {
				res.setHeader("X-Content-Type-Options", "nosniff")
			}
		})
	)

	// Checks that the request comes from the seller of an unsold toy, sends the error otherwise
	async function getEditableToy(req: express.Request, res: express.Response) {
		let user
		try {
			user = await retrieveUserByAccessToken(req.headers.authorization)
		} catch (error) {
			sendError(
				res,
				error?.extensions?.code == apiErrors.davApiUnavailable.code
					? apiErrors.davApiUnavailable
					: apiErrors.sessionExpired
			)
			return null
		}
		if (user == null) {
			sendError(res, apiErrors.notAuthenticated)
			return null
		}

		const toy = await dependencies.prisma.toy.findFirst({
			where: { uuid: req.params.uuid as string }
		})
		if (toy == null) {
			sendError(res, apiErrors.toyDoesNotExist)
			return null
		}
		if (toy.userId != BigInt(user.Id)) {
			sendError(res, apiErrors.actionNotAllowed)
			return null
		}
		if (toy.soldAt != null) {
			sendError(res, apiErrors.toyAlreadySold)
			return null
		}

		return toy
	}

	router.post(
		"/toys/:uuid/photos",
		express.raw({ type: photoContentTypes, limit: toyPhotoMaxBytes }),
		async (req, res) => {
			try {
				const toy = await getEditableToy(req, res)
				if (toy == null) return

				const data: unknown = req.body
				if (!Buffer.isBuffer(data) || data.length == 0)
					return sendError(res, apiErrors.photoInvalid)

				const extension = detectImageExtension(data)
				if (extension == null) return sendError(res, apiErrors.photoInvalid)

				const count = await dependencies.prisma.toyPhoto.count({
					where: { toyId: toy.id }
				})
				if (count >= toyPhotoMaxCount)
					return sendError(res, apiErrors.tooManyPhotos)

				const fileName = `${randomUUID()}.${extension}`
				await mkdir(root, { recursive: true })
				await writeFile(path.join(root, fileName), data)

				let photo
				try {
					photo = await dependencies.prisma.toyPhoto.create({
						data: { toyId: toy.id, fileName }
					})
				} catch (error) {
					await deletePhotoFiles([fileName])
					throw error
				}

				await invalidateCache(dependencies.redis)
				res.status(201).json({
					uuid: photo.uuid,
					url: `/photos/${fileName}`
				})
			} catch (error) {
				console.error(error)
				sendError(res, apiErrors.unexpectedError)
			}
		}
	)

	// Uploads a drawing of the logged in user, the body is the raw image
	router.post(
		"/drawings",
		express.raw({ type: photoContentTypes, limit: drawingMaxBytes }),
		async (req, res) => {
			try {
				let user
				try {
					user = await retrieveUserByAccessToken(req.headers.authorization)
				} catch (error) {
					return sendError(
						res,
						error?.extensions?.code == apiErrors.davApiUnavailable.code
							? apiErrors.davApiUnavailable
							: apiErrors.sessionExpired
					)
				}
				if (user == null) return sendError(res, apiErrors.notAuthenticated)

				const data: unknown = req.body
				if (!Buffer.isBuffer(data) || data.length == 0)
					return sendError(res, apiErrors.photoInvalid)

				const extension = detectImageExtension(data)
				if (extension == null) return sendError(res, apiErrors.photoInvalid)

				const userId = BigInt(user.Id)
				const count = await dependencies.prisma.drawing.count({
					where: { userId }
				})
				if (count >= drawingMaxCount)
					return sendError(res, apiErrors.tooManyDrawings)

				if (!Number.isInteger(drawingTableId)) {
					console.error("DAV_DRAWING_TABLE_ID and DAV_TOY_TABLE_ID are not set")
					return sendError(res, apiErrors.unexpectedError)
				}

				// The drawing needs a TableObject in dav, so that it can be paid with the dav checkout
				const uuid = randomUUID()
				const tableObjectResponse =
					await TableObjectsController.createTableObject("uuid", {
						accessToken: req.headers.authorization,
						uuid,
						tableId: drawingTableId
					})

				if (tableObjectResponse == null || Array.isArray(tableObjectResponse)) {
					console.error("Could not create the TableObject", tableObjectResponse)
					return sendError(res, apiErrors.unexpectedError)
				}

				const fileName = `${randomUUID()}.${extension}`
				await mkdir(root, { recursive: true })
				await writeFile(path.join(root, fileName), data)

				let drawing
				try {
					drawing = await dependencies.prisma.drawing.create({
						data: { uuid, userId, fileName }
					})
				} catch (error) {
					await deletePhotoFiles([fileName])
					throw error
				}

				await invalidateCache(dependencies.redis)
				await sendDrawingUploadedEmail({
					drawingUuid: drawing.uuid,
					userId,
					attachment: { filename: fileName, content: data }
				})
				res.status(201).json({
					uuid: drawing.uuid,
					url: `/photos/${fileName}`,
					status: drawing.status,
					createdAt: drawing.createdAt.toISOString(),
					updatedAt: drawing.updatedAt.toISOString()
				})
			} catch (error) {
				console.error(error)
				sendError(res, apiErrors.unexpectedError)
			}
		}
	)

	router.delete("/toys/:uuid/photos/:photoUuid", async (req, res) => {
		try {
			const toy = await getEditableToy(req, res)
			if (toy == null) return

			const photo = await dependencies.prisma.toyPhoto.findFirst({
				where: { uuid: req.params.photoUuid, toyId: toy.id }
			})
			if (photo == null) return sendError(res, apiErrors.photoDoesNotExist)

			await dependencies.prisma.toyPhoto.delete({ where: { id: photo.id } })
			await deletePhotoFiles([photo.fileName])
			await invalidateCache(dependencies.redis)
			res.sendStatus(204)
		} catch (error) {
			console.error(error)
			sendError(res, apiErrors.unexpectedError)
		}
	})

	// Too large bodies are rejected by express.raw before the handler above runs
	router.use(
		(
			error: any,
			req: express.Request,
			res: express.Response,
			next: express.NextFunction
		) => {
			if (error?.type == "entity.too.large")
				return sendError(res, apiErrors.photoTooLarge)

			next(error)
		}
	)

	return router
}
