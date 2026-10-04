import { User, UsersController, convertUserResourceToUser } from "dav-js"
import { throwApiError } from "../utils.js"
import { apiErrors } from "../errors.js"

/** Returns the user of the access token, or null if there is no token */
export async function retrieveUserByAccessToken(
	accessToken?: string
): Promise<User> {
	if (accessToken == null) return null

	let userResponse: Awaited<ReturnType<typeof UsersController.retrieveUser>>

	try {
		userResponse = await UsersController.retrieveUser(
			`
				id
				email
				firstName
				plan
			`,
			{ accessToken }
		)
	} catch (error) {
		// dav-js throws if the dav API cannot be reached
		console.error("Could not reach the dav API", error)
		throwApiError(apiErrors.davApiUnavailable)
	}

	if (Array.isArray(userResponse)) {
		throwApiError(apiErrors.sessionExpired)
		return null
	}

	return convertUserResourceToUser(userResponse)
}
