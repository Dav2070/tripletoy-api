import { UserProfile } from "../generated/prisma/client.js"
import { throwValidationError } from "../utils.js"
import { validationErrors } from "../errors.js"
import {
	profileAgeMin,
	profileAgeMax,
	profileDescriptionMaxLength,
	profileAddressFieldMaxLength,
	profilePhoneRegex
} from "../constants.js"
import { ResolverContext, QueryResult } from "../types.js"

interface AddressInput {
	name?: string
	line1?: string
	line2?: string
	postalCode?: string
	city?: string
	country?: string
}

const emptyProfile = { age: null, description: null }

/** Returns the profile of the logged in user, empty if nothing was saved yet */
export async function retrieveMyProfile(
	parent: any,
	args: {},
	context: ResolverContext
): Promise<QueryResult<Partial<UserProfile>>> {
	const profile = await context.prisma.userProfile.findUnique({
		where: { userId: BigInt(context.user.Id) }
	})

	return { caching: false, data: profile ?? emptyProfile }
}

export async function updateMyProfile(
	parent: any,
	args: {
		age?: number
		description?: string
		address?: AddressInput
		phone?: string
	},
	context: ResolverContext
): Promise<UserProfile> {
	const age = args.age ?? null
	const description = args.description?.trim() || null
	const phone = args.phone?.trim() || null

	// Empty fields are stored as null
	const address = Object.fromEntries(
		["name", "line1", "line2", "postalCode", "city", "country"].map(key => [
			key,
			(args.address?.[key] as string | undefined)?.trim() || null
		])
	)

	throwValidationError(
		age != null &&
			(!Number.isInteger(age) || age < profileAgeMin || age > profileAgeMax)
			? validationErrors.ageInvalid
			: null,
		description != null && description.length > profileDescriptionMaxLength
			? validationErrors.profileDescriptionTooLong
			: null,
		Object.values(address).some(
			v => v != null && v.length > profileAddressFieldMaxLength
		)
			? validationErrors.addressInvalid
			: null,
		phone != null && !profilePhoneRegex.test(phone)
			? validationErrors.phoneInvalid
			: null
	)

	const userId = BigInt(context.user.Id)

	const data = {
		age,
		description,
		phone,
		addressName: address.name,
		addressLine1: address.line1,
		addressLine2: address.line2,
		addressPostalCode: address.postalCode,
		addressCity: address.city,
		addressCountry: address.country
	}

	return await context.prisma.userProfile.upsert({
		where: { userId },
		create: { userId, ...data },
		update: data
	})
}
