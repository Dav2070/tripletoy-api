import { randomUUID } from "node:crypto"
import { TableObjectsController } from "dav-js"
import { Toy } from "../generated/prisma/client.js"
import { deletePhotoFiles } from "../services/photoStorage.js"
import { throwApiError, throwValidationError } from "../utils.js"
import { apiErrors, validationErrors } from "../errors.js"
import {
	toyTitleMaxLength,
	toyDescriptionMaxLength,
	toyPriceMin,
	toyPriceMax,
	toyTableId
} from "../constants.js"
import { ResolverContext, QueryResult, List } from "../types.js"

const toyInclude = { photos: { orderBy: { id: "asc" } } } as const

export async function retrieveToy(
	parent: any,
	args: { uuid: string },
	context: ResolverContext
): Promise<QueryResult<Toy>> {
	return {
		caching: true,
		data: await context.prisma.toy.findFirst({
			where: { uuid: args.uuid },
			include: toyInclude
		})
	}
}

async function findToys(
	args: { limit?: number; offset?: number },
	context: ResolverContext,
	where?: { userId: bigint }
): Promise<List<Toy>> {
	let take = args.limit || 10
	if (take <= 0) take = 10

	let skip = args.offset || 0
	if (skip < 0) skip = 0

	let [total, items] = await context.prisma.$transaction([
		context.prisma.toy.count({ where }),
		context.prisma.toy.findMany({
			where,
			orderBy: { id: "desc" },
			include: toyInclude,
			take,
			skip
		})
	])

	return { total, items }
}

export async function listToys(
	parent: any,
	args: { limit?: number; offset?: number },
	context: ResolverContext
): Promise<QueryResult<List<Toy>>> {
	return {
		caching: true,
		data: await findToys(args, context)
	}
}

/** Lists the toys of the logged in user */
export async function listMyToys(
	parent: any,
	args: { limit?: number; offset?: number },
	context: ResolverContext
): Promise<QueryResult<List<Toy>>> {
	return {
		caching: false,
		data: await findToys(args, context, {
			userId: BigInt(context.user.Id)
		})
	}
}

function validateToyInput(args: {
	title: string
	description?: string
	price: number
}) {
	const title = args.title.trim()
	const description = args.description?.trim() || null

	throwValidationError(
		title.length < 1 ? validationErrors.titleTooShort : null,
		title.length > toyTitleMaxLength ? validationErrors.titleTooLong : null,
		description != null && description.length > toyDescriptionMaxLength
			? validationErrors.descriptionTooLong
			: null,
		!Number.isInteger(args.price) ||
			args.price < toyPriceMin ||
			args.price > toyPriceMax
			? validationErrors.priceInvalid
			: null
	)

	return { title, description, price: args.price }
}

export async function createToy(
	parent: any,
	args: { title: string; description?: string; price: number },
	context: ResolverContext
): Promise<Toy> {
	const { title, description, price } = validateToyInput(args)

	if (!Number.isInteger(toyTableId)) {
		console.error("DAV_TOY_TABLE_ID is not set")
		throwApiError(apiErrors.unexpectedError)
	}

	// The toy needs a TableObject in dav, so that it can be bought with the dav checkout.
	// It is created before the toy, a rejected dav request must not leave a toy behind.
	const uuid = randomUUID()
	const tableObjectResponse = await TableObjectsController.createTableObject(
		"uuid",
		{ accessToken: context.accessToken, uuid, tableId: toyTableId }
	)

	if (tableObjectResponse == null || Array.isArray(tableObjectResponse)) {
		console.error("Could not create the TableObject", tableObjectResponse)
		throwApiError(apiErrors.unexpectedError)
	}

	return await context.prisma.toy.create({
		data: {
			uuid,
			userId: BigInt(context.user.Id),
			title,
			description,
			price
		},
		include: toyInclude
	})
}

/** Returns the toy if it belongs to the user and has not been sold yet */
async function getEditableToy(uuid: string, context: ResolverContext) {
	const toy = await context.prisma.toy.findFirst({ where: { uuid } })

	if (toy == null) throwApiError(apiErrors.toyDoesNotExist)
	if (toy.userId != BigInt(context.user.Id))
		throwApiError(apiErrors.actionNotAllowed)
	if (toy.soldAt != null) throwApiError(apiErrors.toyAlreadySold)

	return toy
}

export async function updateToy(
	parent: any,
	args: { uuid: string; title: string; description?: string; price: number },
	context: ResolverContext
): Promise<Toy> {
	const data = validateToyInput(args)
	const toy = await getEditableToy(args.uuid, context)

	// A purchase may have been completed in the meantime
	const { count } = await context.prisma.toy.updateMany({
		where: { id: toy.id, soldAt: null },
		data
	})

	if (count == 0) throwApiError(apiErrors.toyAlreadySold)

	return await context.prisma.toy.findFirst({
		where: { id: toy.id },
		include: toyInclude
	})
}

export async function deleteToy(
	parent: any,
	args: { uuid: string },
	context: ResolverContext
): Promise<boolean> {
	const toy = await getEditableToy(args.uuid, context)
	const photos = await context.prisma.toyPhoto.findMany({
		where: { toyId: toy.id }
	})

	// The photos are removed with the toy by the cascade
	const { count } = await context.prisma.toy.deleteMany({
		where: { id: toy.id, soldAt: null }
	})

	if (count == 0) throwApiError(apiErrors.toyAlreadySold)

	// The toy is gone, so a failure here only leaves behind data that is not used anymore
	const tableObjectResponse = await TableObjectsController.deleteTableObject(
		"uuid",
		{ accessToken: context.accessToken, uuid: toy.uuid }
	)

	if (tableObjectResponse == null || Array.isArray(tableObjectResponse)) {
		console.error("Could not delete the TableObject", tableObjectResponse)
	}

	await deletePhotoFiles(photos.map(p => p.fileName))

	return true
}
