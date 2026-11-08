import { randomUUID } from "node:crypto"
import { Event } from "../generated/prisma/client.js"
import { geocodeAddress } from "../services/geocodingService.js"
import { throwApiError, throwValidationError } from "../utils.js"
import { apiErrors, validationErrors } from "../errors.js"
import {
	eventTitleMaxLength,
	eventDescriptionMaxLength,
	eventUrlMaxLength,
	eventRadiusDefault,
	eventRadiusMax,
	eventsMax,
	eventDefaultDurationHours,
	profileAddressFieldMaxLength
} from "../constants.js"
import { ResolverContext, QueryResult } from "../types.js"

interface EventInput {
	title: string
	description?: string | null
	startsAt: string
	endsAt?: string | null
	venue?: string | null
	line1: string
	postalCode: string
	city: string
	country: string
	url?: string | null
}

/** Parses an ISO 8601 date and time, returns null if it is invalid */
function parseDateTime(value: string | null | undefined): Date | null {
	if (!value) return null

	const date = new Date(value)
	return isNaN(date.getTime()) ? null : date
}

function isValidUrl(value: string): boolean {
	try {
		const url = new URL(value)
		return url.protocol == "http:" || url.protocol == "https:"
	} catch {
		return false
	}
}

/** Validates and cleans the input, the position is not looked up here */
function validateEventInput(input: EventInput) {
	const title = input.title?.trim() ?? ""
	const description = input.description?.trim() || null
	const venue = input.venue?.trim() || null
	const line1 = input.line1?.trim() ?? ""
	const postalCode = input.postalCode?.trim() ?? ""
	const city = input.city?.trim() ?? ""
	const country = input.country?.trim() ?? ""
	const url = input.url?.trim() || null
	const startsAt = parseDateTime(input.startsAt)
	const endsAt = parseDateTime(input.endsAt)

	const addressFields = [venue ?? "", line1, postalCode, city, country]

	throwValidationError(
		title.length == 0 ? validationErrors.titleTooShort : null,
		title.length > eventTitleMaxLength ? validationErrors.titleTooLong : null,
		description != null && description.length > eventDescriptionMaxLength
			? validationErrors.descriptionTooLong
			: null,
		startsAt == null ? validationErrors.eventStartInvalid : null,
		input.endsAt && (endsAt == null || (startsAt != null && endsAt < startsAt))
			? validationErrors.eventEndInvalid
			: null,
		url != null && (url.length > eventUrlMaxLength || !isValidUrl(url))
			? validationErrors.eventUrlInvalid
			: null,
		[line1, postalCode, city, country].some(v => v.length == 0)
			? validationErrors.addressRequired
			: null,
		addressFields.some(v => v.length > profileAddressFieldMaxLength)
			? validationErrors.addressInvalid
			: null
	)

	return {
		title,
		description,
		startsAt,
		endsAt,
		venue,
		line1,
		postalCode,
		city,
		country,
		url
	}
}

/** Looks up the position of the postal code area, events without a position cannot be found by distance */
async function findPosition(data: ReturnType<typeof validateEventInput>) {
	const position = await geocodeAddress({
		name: data.venue ?? data.title,
		line1: data.line1,
		line2: null,
		postalCode: data.postalCode,
		city: data.city,
		country: data.country
	})

	throwValidationError(
		position == null ? validationErrors.eventLocationNotFound : null
	)

	return position
}

/**
 * Lists the upcoming events within the radius around the position, the next ones first.
 * Events without an end time count as upcoming for a few hours after the start.
 */
export async function listEvents(
	parent: any,
	args: { latitude: number; longitude: number; radius?: number },
	context: ResolverContext
): Promise<QueryResult<(Event & { distance: number })[]>> {
	throwValidationError(
		!(args.latitude >= -90 && args.latitude <= 90) ||
			!(args.longitude >= -180 && args.longitude <= 180)
			? validationErrors.locationInvalid
			: null
	)

	let radius = args.radius ?? eventRadiusDefault
	if (!(radius > 0)) radius = eventRadiusDefault
	radius = Math.min(radius, eventRadiusMax)

	const now = new Date()
	const startedSince = new Date(
		now.getTime() - eventDefaultDurationHours * 60 * 60 * 1000
	)

	const rows = await context.prisma.$queryRaw<
		{ id: bigint; distance: number }[]
	>`
		SELECT "id", "distance" FROM (
			SELECT e."id", e."startsAt",
				6371 * 2 * ASIN(SQRT(LEAST(1,
					POWER(SIN(RADIANS(e."latitude" - ${args.latitude}::float8) / 2), 2) +
					COS(RADIANS(${args.latitude}::float8)) * COS(RADIANS(e."latitude")) *
					POWER(SIN(RADIANS(e."longitude" - ${args.longitude}::float8) / 2), 2)
				))) AS "distance"
			FROM "Event" e
			WHERE e."endsAt" >= ${now}::timestamp
				OR (e."endsAt" IS NULL AND e."startsAt" >= ${startedSince}::timestamp)
		) nearby
		WHERE "distance" <= ${radius}::float8
		ORDER BY "startsAt" ASC, "id" ASC
		LIMIT ${eventsMax}
	`

	const events = await context.prisma.event.findMany({
		where: { id: { in: rows.map(r => r.id) } }
	})
	const eventsById = new Map(events.map(e => [e.id, e]))

	const data = rows
		.filter(row => eventsById.has(row.id))
		.map(row => ({
			...eventsById.get(row.id),
			// One decimal is enough, the position is only approximate anyway
			distance: Math.round(row.distance * 10) / 10
		}))

	// The result depends on the position of the user, so it is not cached
	return { caching: false, data }
}

/** Lists all events including the past ones, the latest first */
export async function listAllEvents(
	parent: any,
	args: {},
	context: ResolverContext
): Promise<Event[]> {
	return await context.prisma.event.findMany({
		orderBy: [{ startsAt: "desc" }, { id: "desc" }]
	})
}

export async function createEvent(
	parent: any,
	args: { input: EventInput },
	context: ResolverContext
): Promise<Event> {
	const data = validateEventInput(args.input)
	const position = await findPosition(data)

	return await context.prisma.event.create({
		data: { uuid: randomUUID(), ...data, ...position }
	})
}

export async function updateEvent(
	parent: any,
	args: { uuid: string; input: EventInput },
	context: ResolverContext
): Promise<Event> {
	const event = await context.prisma.event.findUnique({
		where: { uuid: args.uuid }
	})
	if (event == null) throwApiError(apiErrors.eventDoesNotExist)

	const data = validateEventInput(args.input)

	// The position is only looked up again if the place has changed
	const placeChanged =
		data.postalCode != event.postalCode ||
		data.city != event.city ||
		data.country != event.country
	const position = placeChanged
		? await findPosition(data)
		: { latitude: event.latitude, longitude: event.longitude }

	return await context.prisma.event.update({
		where: { id: event.id },
		data: { ...data, ...position }
	})
}

export async function deleteEvent(
	parent: any,
	args: { uuid: string },
	context: ResolverContext
): Promise<boolean> {
	const event = await context.prisma.event.findUnique({
		where: { uuid: args.uuid }
	})
	if (event == null) throwApiError(apiErrors.eventDoesNotExist)

	await context.prisma.event.delete({ where: { id: event.id } })
	return true
}
