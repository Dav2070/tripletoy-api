export const apiErrors = {
	unexpectedError: {
		code: "UNEXPECTED_ERROR",
		message: "Unexpected error"
	},
	davApiUnavailable: {
		code: "DAV_API_UNAVAILABLE",
		message: "The dav API is not reachable",
		status: 503
	},
	notAuthenticated: {
		code: "NOT_AUTHENTICATED",
		message: "You are not authenticated",
		status: 401
	},
	actionNotAllowed: {
		code: "ACTION_NOT_ALLOWED",
		message: "Action not allowed",
		status: 403
	},
	validationFailed: {
		code: "VALIDATION_FAILED",
		message: "Validation failed",
		status: 400
	},
	sessionExpired: {
		code: "SESSION_EXPIRED",
		message: "Session has expired and must be renewed",
		status: 403
	},
	toyDoesNotExist: {
		code: "TOY_NOT_EXISTS",
		message: "Toy does not exist",
		status: 404
	},
	toyAlreadySold: {
		code: "TOY_ALREADY_SOLD",
		message: "The toy has already been sold",
		status: 409
	},
	cannotBuyOwnToy: {
		code: "CANNOT_BUY_OWN_TOY",
		message: "You cannot buy your own toy",
		status: 403
	},
	photoDoesNotExist: {
		code: "PHOTO_NOT_EXISTS",
		message: "Photo does not exist",
		status: 404
	},
	photoInvalid: {
		code: "PHOTO_INVALID",
		message: "The photo must be a JPEG, PNG or WebP image",
		status: 415
	},
	photoTooLarge: {
		code: "PHOTO_TOO_LARGE",
		message: "The photo is too large",
		status: 413
	},
	tooManyPhotos: {
		code: "TOO_MANY_PHOTOS",
		message: "The toy has too many photos",
		status: 400
	}
}

export const validationErrors = {
	titleTooShort: "TITLE_TOO_SHORT",
	titleTooLong: "TITLE_TOO_LONG",
	descriptionTooLong: "DESCRIPTION_TOO_LONG",
	priceInvalid: "PRICE_INVALID",
	birthDateInvalid: "BIRTH_DATE_INVALID",
	addressInvalid: "ADDRESS_INVALID",
	addressRequired: "ADDRESS_REQUIRED",
	locationInvalid: "LOCATION_INVALID",
	phoneInvalid: "PHONE_INVALID",
	profileDescriptionTooLong: "PROFILE_DESCRIPTION_TOO_LONG"
}
