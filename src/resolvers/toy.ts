import { randomUUID } from "node:crypto"
import { TableObjectsController } from "dav-js"
import { Toy, Prisma } from "../generated/prisma/client.js"
import { deletePhotoFiles } from "../services/photoStorage.js"
import {
	AddressInput,
	addressFromProfile,
	addressToColumns,
	cleanAddress,
	isAddressComplete,
	isAddressTooLong
} from "../services/addressService.js"
import { throwApiError, throwValidationError } from "../utils.js"
import { apiErrors, validationErrors } from "../errors.js"
import {
	toyTitleMaxLength,
	toyDescriptionMaxLength,
	toyPriceMin,
	toyPriceMax,
	toyTableId,
	soldToyVisibleDays,
	coinsPerPurchase,
	coinsPerSale
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
	where?: Prisma.ToyWhereInput,
	orderBy:
		| Prisma.ToyOrderByWithRelationInput
		| Prisma.ToyOrderByWithRelationInput[] = { id: "desc" }
): Promise<List<Toy>> {
	let take = args.limit || 10
	if (take <= 0) take = 10

	let skip = args.offset || 0
	if (skip < 0) skip = 0

	let [total, items] = await context.prisma.$transaction([
		context.prisma.toy.count({ where }),
		context.prisma.toy.findMany({
			where,
			orderBy,
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
		// Sold toys are only listed for a week, afterwards they are only shown
		// to the seller and the buyer. Unsold toys come first, then the sold ones.
		data: await findToys(
			args,
			context,
			{
				OR: [
					{ soldAt: null },
					{
						soldAt: {
							gte: new Date(
								Date.now() - soldToyVisibleDays * 24 * 60 * 60 * 1000
							)
						}
					}
				]
			},
			[{ soldAt: { sort: "desc", nulls: "first" } }, { id: "desc" }]
		)
	}
}

/** Lists the toys the logged in user has bought, the latest purchase first */
export async function listMyPurchases(
	parent: any,
	args: { limit?: number; offset?: number },
	context: ResolverContext
): Promise<QueryResult<List<Toy>>> {
	return {
		caching: false,
		data: await findToys(
			args,
			context,
			{ order: { is: { buyerId: BigInt(context.user.Id) } } },
			{ order: { createdAt: "desc" } }
		)
	}
}

/** Counts the active, sold and bought toys and the collected coins of the logged in user */
export async function retrieveMyToyStats(
	parent: any,
	args: {},
	context: ResolverContext
): Promise<
	QueryResult<{ active: number; sold: number; bought: number; coins: number }>
> {
	const userId = BigInt(context.user.Id)

	const [active, sold, bought, completedSales] =
		await context.prisma.$transaction([
			context.prisma.toy.count({ where: { userId, soldAt: null } }),
			context.prisma.toy.count({ where: { userId, soldAt: { not: null } } }),
			context.prisma.toyOrder.count({ where: { buyerId: userId } }),
			context.prisma.toyOrder.count({ where: { toy: { userId } } })
		])

	// Buyers get coins for every purchase and sellers for every sale
	const coins = bought * coinsPerPurchase + completedSales * coinsPerSale

	return { caching: false, data: { active, sold, bought, coins } }
}

/** Lists the toys of the logged in user, including the sold ones */
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
	args: {
		title: string
		description?: string
		price: number
		address?: AddressInput
	},
	context: ResolverContext
): Promise<Toy> {
	const { title, description, price } = validateToyInput(args)
	const userId = BigInt(context.user.Id)

	// Toys can only be sold with a shipping address in the profile. If there is none
	// yet, the address of the request is saved to the profile.
	const profile = await context.prisma.userProfile.findUnique({
		where: { userId }
	})
	let newAddress = null

	if (!isAddressComplete(addressFromProfile(profile))) {
		newAddress = cleanAddress(args.address)

		throwValidationError(
			isAddressTooLong(newAddress) ? validationErrors.addressInvalid : null,
			!isAddressComplete(newAddress)
				? validationErrors.addressRequired
				: null
		)
	}

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

	if (newAddress != null) {
		const columns = addressToColumns(newAddress)

		await context.prisma.userProfile.upsert({
			where: { userId },
			create: { userId, ...columns },
			update: columns
		})
	}

	return await context.prisma.toy.create({
		data: {
			uuid,
			userId,
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
