import {
	Address,
	addressToColumns,
	isAddressComplete
} from "./addressService.js"

export interface Coordinates {
	latitude: number
	longitude: number
}

const geocoderUrl =
	process.env.GEOCODER_URL || "https://nominatim.openstreetmap.org/search"
const geocoderUserAgent = process.env.GEOCODER_USER_AGENT || "3pletoy/1.0"

// Two decimals are about one kilometer, the position is only meant to be approximate
function round(value: number) {
	return Math.round(value * 100) / 100
}

/**
 * Looks up the position of the postal code area of the address. The street is not sent
 * to the geocoder on purpose, so that only an approximate position is stored.
 */
export async function geocodeAddress(
	address: Address
): Promise<Coordinates | null> {
	if (!isAddressComplete(address)) return null

	try {
		const url = new URL(geocoderUrl)
		url.searchParams.set("format", "jsonv2")
		url.searchParams.set("limit", "1")
		url.searchParams.set("postalcode", address.postalCode)
		url.searchParams.set("city", address.city)
		url.searchParams.set("country", address.country)

		const response = await fetch(url, {
			headers: { "User-Agent": geocoderUserAgent },
			signal: AbortSignal.timeout(5000)
		})

		if (!response.ok) throw new Error(`Geocoder returned ${response.status}`)

		const results = (await response.json()) as { lat: string; lon: string }[]
		if (results.length == 0) return null

		const latitude = Number(results[0].lat)
		const longitude = Number(results[0].lon)
		if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

		return { latitude: round(latitude), longitude: round(longitude) }
	} catch (error) {
		// Saving the address must not fail if the geocoder is not available
		console.error("Could not geocode the address", error)
		return null
	}
}

/**
 * Returns the profile columns of the address and its position. The position is only
 * looked up again if the address has changed or there is none yet.
 */
export async function getAddressColumns(
	address: Address,
	existing?: {
		addressName?: string | null
		addressLine1?: string | null
		addressLine2?: string | null
		addressPostalCode?: string | null
		addressCity?: string | null
		addressCountry?: string | null
		latitude?: number | null
		longitude?: number | null
	} | null
) {
	const columns = addressToColumns(address)

	const unchanged = (Object.keys(columns) as (keyof typeof columns)[]).every(
		key => (existing?.[key] ?? null) == columns[key]
	)

	if (unchanged && existing?.latitude != null && existing?.longitude != null) {
		return {
			...columns,
			latitude: existing.latitude,
			longitude: existing.longitude
		}
	}

	const coordinates = await geocodeAddress(address)

	return {
		...columns,
		latitude: coordinates?.latitude ?? null,
		longitude: coordinates?.longitude ?? null
	}
}
