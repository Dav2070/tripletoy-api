import {
	Auth,
	User,
	UsersController,
	convertUserResourceToUser
} from "dav-js"
import { throwApiError } from "../utils.js"
import { apiErrors } from "../errors.js"
import { admins } from "../constants.js"

// The email addresses of the admins rarely change, so they are only retrieved once an hour
const adminEmailsTtl = 60 * 60 * 1000
let adminEmailsCache: { emails: string[]; expiresAt: number } | null = null

/**
 * Returns the email addresses of the admins (ADMIN_USER_IDS) from the dav API. Admins that
 * cannot be retrieved are skipped, so the result may be empty.
 */
export async function retrieveAdminEmails(): Promise<string[]> {
	if (adminEmailsCache != null && adminEmailsCache.expiresAt > Date.now()) {
		return adminEmailsCache.emails
	}

	const auth = new Auth({
		apiKey: process.env.DAV_API_KEY,
		secretKey: process.env.DAV_SECRET_KEY,
		uuid: process.env.DAV_UUID
	})
	const emails: string[] = []
	let complete = true

	for (const id of admins) {
		try {
			const response = await UsersController.retrieveUserById("email", {
				auth,
				id
			})

			if (response == null || Array.isArray(response) || !response.email) {
				console.error(`Could not retrieve the email of admin ${id}`, response)
				complete = false
			} else {
				emails.push(response.email)
			}
		} catch (error) {
			console.error(`Could not retrieve the email of admin ${id}`, error)
			complete = false
		}
	}

	// Try again with the next email if an admin could not be retrieved
	if (complete) {
		adminEmailsCache = { emails, expiresAt: Date.now() + adminEmailsTtl }
	}

	return emails
}

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

/** Returns the email address and the first name of a user from the dav API, or null if it fails */
export async function retrieveUserContact(
	id: number
): Promise<{ email: string; firstName: string } | null> {
	try {
		const response = await UsersController.retrieveUserById(
			`
				email
				firstName
			`,
			{
				auth: new Auth({
					apiKey: process.env.DAV_API_KEY,
					secretKey: process.env.DAV_SECRET_KEY,
					uuid: process.env.DAV_UUID
				}),
				id
			}
		)

		if (response == null || Array.isArray(response) || !response.email) {
			console.error(`Could not retrieve the email of the user ${id}`, response)
			return null
		}

		return { email: response.email, firstName: response.firstName ?? "" }
	} catch (error) {
		console.error(`Could not retrieve the email of the user ${id}`, error)
		return null
	}
}

export interface PublicUser {
	firstName: string
	profileImage: string | null
}

// The name and the profile image of other users, e.g. of the chat partners
const publicUserTtl = 10 * 60 * 1000
const publicUserCache = new Map<number, { user: PublicUser; expiresAt: number }>()

/** Returns the first name and the profile image of a user from the dav API, or null if it fails */
export async function retrievePublicUser(id: number): Promise<PublicUser | null> {
	const cached = publicUserCache.get(id)
	if (cached != null && cached.expiresAt > Date.now()) return cached.user

	try {
		const response = await UsersController.retrieveUserById(
			`
				firstName
				profileImage {
					url
				}
			`,
			{
				auth: new Auth({
					apiKey: process.env.DAV_API_KEY,
					secretKey: process.env.DAV_SECRET_KEY,
					uuid: process.env.DAV_UUID
				}),
				id
			}
		)

		if (response == null || Array.isArray(response)) {
			console.error(`Could not retrieve the user ${id}`, response)
			return null
		}

		const user: PublicUser = {
			firstName: response.firstName ?? "",
			profileImage: response.profileImage?.url || null
		}
		publicUserCache.set(id, { user, expiresAt: Date.now() + publicUserTtl })
		return user
	} catch (error) {
		console.error(`Could not retrieve the user ${id}`, error)
		return null
	}
}
