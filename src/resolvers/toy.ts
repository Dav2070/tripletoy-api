import { randomUUID } from "node:crypto"
import { TableObjectsController } from "dav-js"
import { Toy, Prisma } from "../generated/prisma/client.js"
import { deletePhotoFiles } from "../services/photoStorage.js"
import {
	AddressInput,
	addressFromProfile,
	cleanAddress,
	isAddressComplete,
	isAddressTooLong
} from "../services/addressService.js"
import { getAddressColumns } from "../services/geocodingService.js"
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
	coinsPerSale,
	toyLocationsMax,
	fixedProductsUserId
} from "../constants.js"
import { ResolverContext, QueryResult, List } from "../types.js"

// Maximum number of fixed products
const fixedToysMax = 50

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
	args: {
		limit?: number
		offset?: number
		latitude?: number
		longitude?: number
	},
	context: ResolverContext
): Promise<QueryResult<List<Toy>>> {
	// Sold toys are only listed for a week, afterwards they are only shown
	// to the seller and the buyer. Unsold toys come first, then the sold ones.
	const soldSince = new Date(
		Date.now() - soldToyVisibleDays * 24 * 60 * 60 * 1000
	)
	const where: Prisma.ToyWhereInput = {
		OR: [{ soldAt: null }, { soldAt: { gte: soldSince } }],
		// The fixed products are listed separately
		...(fixedProductsUserId != null && {
			userId: { not: fixedProductsUserId }
		})
	}

	if (args.latitude != null || args.longitude != null) {
		throwValidationError(
			args.latitude == null ||
				args.longitude == null ||
				!(args.latitude >= -90 && args.latitude <= 90) ||
				!(args.longitude >= -180 && args.longitude <= 180)
				? validationErrors.locationInvalid
				: null
		)

		// The result depends on the location of the user, so it is not cached
		return {
			caching: false,
			data: await findToysByDistance(
				args,
				context,
				where,
				soldSince,
				args.latitude,
				args.longitude
			)
		}
	}

	return {
		caching: true,
		data: await findToys(args, context, where, [
			{ soldAt: { sort: "desc", nulls: "first" } },
			{ id: "desc" }
		])
	}
}

/** Lists the fixed products, which are the toys of the user with FIXED_PRODUCTS_USER_ID */
export async function listFixedToys(
	parent: any,
	args: {},
	context: ResolverContext
): Promise<QueryResult<Toy[]>> {
	if (fixedProductsUserId == null) return { caching: true, data: [] }

	return {
		caching: true,
		data: await context.prisma.toy.findMany({
			where: { userId: fixedProductsUserId },
			orderBy: { id: "asc" },
			include: toyInclude,
			take: fixedToysMax
		})
	}
}

/**
 * Lists the toys sorted by the distance of the seller to the given position. The
 * distance is the great-circle distance in kilometers to the approximate position of
 * the seller. Toys of sellers without a position come last, sold toys always at the end.
 */
async function findToysByDistance(
	args: { limit?: number; offset?: number },
	context: ResolverContext,
	where: Prisma.ToyWhereInput,
	soldSince: Date,
	latitude: number,
	longitude: number
): Promise<List<Toy>> {
	let take = args.limit || 10
	if (take <= 0) take = 10

	let skip = args.offset || 0
	if (skip < 0) skip = 0

	const [total, rows] = await Promise.all([
		context.prisma.toy.count({ where }),
		context.prisma.$queryRaw<{ id: bigint; distance: number | null }[]>`
			SELECT t."id",
				6371 * 2 * ASIN(SQRT(
					POWER(SIN(RADIANS(p."latitude" - ${latitude}::float8) / 2), 2) +
					COS(RADIANS(${latitude}::float8)) * COS(RADIANS(p."latitude")) *
					POWER(SIN(RADIANS(p."longitude" - ${longitude}::float8) / 2), 2)
				)) AS "distance"
			FROM "Toy" t
			LEFT JOIN "UserProfile" p ON p."userId" = t."userId"
			WHERE (t."soldAt" IS NULL OR t."soldAt" >= ${soldSince}::timestamp)
				AND (${fixedProductsUserId}::bigint IS NULL OR t."userId" <> ${fixedProductsUserId}::bigint)
			ORDER BY (t."soldAt" IS NOT NULL) ASC, "distance" ASC NULLS LAST, t."id" DESC
			LIMIT ${take} OFFSET ${skip}
		`
	])

	const toys = await context.prisma.toy.findMany({
		where: { id: { in: rows.map(r => r.id) } },
		include: toyInclude
	})
	const toysById = new Map(toys.map(t => [t.id, t]))

	const items = rows
		.filter(row => toysById.has(row.id))
		.map(row => ({
			...toysById.get(row.id),
			// One decimal is enough, the position is only approximate anyway
			distance:
				row.distance == null ? null : Math.round(row.distance * 10) / 10
		}))

	return { total, items }
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

/** Lists the approximate positions of the toys that are for sale, for the map */
export async function listToyLocations(
	parent: any,
	args: {},
	context: ResolverContext
): Promise<QueryResult<any[]>> {
	const toys = await context.prisma.toy.findMany({
		where: { soldAt: null },
		orderBy: { id: "desc" },
		take: toyLocationsMax,
		include: { photos: { orderBy: { id: "asc" }, take: 1 } }
	})

	const profiles = await context.prisma.userProfile.findMany({
		where: {
			userId: { in: [...new Set(toys.map(t => t.userId))] },
			latitude: { not: null },
			longitude: { not: null }
		}
	})
	const profilesByUserId = new Map(profiles.map(p => [p.userId, p]))

	const data = toys
		.filter(toy => profilesByUserId.has(toy.userId))
		.map(toy => ({
			uuid: toy.uuid,
			title: toy.title,
			price: toy.price,
			latitude: profilesByUserId.get(toy.userId).latitude,
			longitude: profilesByUserId.get(toy.userId).longitude,
			photo: toy.photos[0] ?? null
		}))

	return { caching: true, data }
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
		const columns = await getAddressColumns(newAddress, profile)

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
