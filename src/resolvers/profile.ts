import { UserProfile } from "../generated/prisma/client.js"
import { throwValidationError } from "../utils.js"
import { validationErrors } from "../errors.js"
import {
	profileAgeMax,
	profileDescriptionMaxLength,
	profilePhoneRegex
} from "../constants.js"
import { parseDate, calculateAge } from "../services/ageService.js"
import {
	AddressInput,
	addressToColumns,
	cleanAddress,
	isAddressTooLong
} from "../services/addressService.js"
import { ResolverContext, QueryResult } from "../types.js"

const emptyProfile = { birthDate: null, description: null }

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
		birthDate?: string
		description?: string
		address?: AddressInput
		phone?: string
	},
	context: ResolverContext
): Promise<UserProfile> {
	const birthDateText = args.birthDate?.trim() || null
	const birthDate = birthDateText != null ? parseDate(birthDateText) : null
	const description = args.description?.trim() || null
	const phone = args.phone?.trim() || null

	const address = cleanAddress(args.address)

	throwValidationError(
		birthDateText != null &&
			(birthDate == null ||
				birthDate.getTime() > Date.now() ||
				calculateAge(birthDate) > profileAgeMax)
			? validationErrors.birthDateInvalid
			: null,
		description != null && description.length > profileDescriptionMaxLength
			? validationErrors.profileDescriptionTooLong
			: null,
		isAddressTooLong(address) ? validationErrors.addressInvalid : null,
		phone != null && !profilePhoneRegex.test(phone)
			? validationErrors.phoneInvalid
			: null
	)

	const userId = BigInt(context.user.Id)

	const data = {
		birthDate,
		description,
		phone,
		...addressToColumns(address)
	}

	return await context.prisma.userProfile.upsert({
		where: { userId },
		create: { userId, ...data },
		update: data
	})
}
