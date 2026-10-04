import { UserProfile } from "../generated/prisma/client.js"
import { throwValidationError } from "../utils.js"
import { validationErrors } from "../errors.js"
import {
	profileAgeMin,
	profileAgeMax,
	profileDescriptionMaxLength
} from "../constants.js"
import { ResolverContext, QueryResult } from "../types.js"

const emptyProfile = { age: null, description: null }

/** Returns the profile of the logged in user, empty if nothing was saved yet */
export async function retrieveMyProfile(
	parent: any,
	args: {},
	context: ResolverContext
): Promise<QueryResult<Pick<UserProfile, "age" | "description">>> {
	const profile = await context.prisma.userProfile.findUnique({
		where: { userId: BigInt(context.user.Id) }
	})

	return { caching: false, data: profile ?? emptyProfile }
}

export async function updateMyProfile(
	parent: any,
	args: { age?: number; description?: string },
	context: ResolverContext
): Promise<UserProfile> {
	const age = args.age ?? null
	const description = args.description?.trim() || null

	throwValidationError(
		age != null &&
			(!Number.isInteger(age) || age < profileAgeMin || age > profileAgeMax)
			? validationErrors.ageInvalid
			: null,
		description != null && description.length > profileDescriptionMaxLength
			? validationErrors.profileDescriptionTooLong
			: null
	)

	const userId = BigInt(context.user.Id)

	return await context.prisma.userProfile.upsert({
		where: { userId },
		create: { userId, age, description },
		update: { age, description }
	})
}
