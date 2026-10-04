import { profileAddressFieldMaxLength } from "../constants.js"

export interface AddressInput {
	name?: string | null
	line1?: string | null
	line2?: string | null
	postalCode?: string | null
	city?: string | null
	country?: string | null
}

export type Address = Record<keyof AddressInput, string | null>

const fields: (keyof AddressInput)[] = [
	"name",
	"line1",
	"line2",
	"postalCode",
	"city",
	"country"
]

/** Trims all fields, empty fields become null */
export function cleanAddress(input?: AddressInput | null): Address {
	return Object.fromEntries(
		fields.map(key => [key, input?.[key]?.trim() || null])
	) as Address
}

export function isAddressTooLong(address: Address): boolean {
	return Object.values(address).some(
		v => v != null && v.length > profileAddressFieldMaxLength
	)
}

/** A shipping address needs everything except the second address line */
export function isAddressComplete(address: Address): boolean {
	return (["name", "line1", "postalCode", "city", "country"] as const).every(
		key => address[key] != null
	)
}

/** Maps the address to the columns of the UserProfile */
export function addressToColumns(address: Address) {
	return {
		addressName: address.name,
		addressLine1: address.line1,
		addressLine2: address.line2,
		addressPostalCode: address.postalCode,
		addressCity: address.city,
		addressCountry: address.country
	}
}

/** Reads the address from a UserProfile row */
export function addressFromProfile(
	profile?: {
		addressName?: string | null
		addressLine1?: string | null
		addressLine2?: string | null
		addressPostalCode?: string | null
		addressCity?: string | null
		addressCountry?: string | null
	} | null
): Address {
	return cleanAddress({
		name: profile?.addressName,
		line1: profile?.addressLine1,
		line2: profile?.addressLine2,
		postalCode: profile?.addressPostalCode,
		city: profile?.addressCity,
		country: profile?.addressCountry
	})
}
