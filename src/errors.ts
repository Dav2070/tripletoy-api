export const apiErrors = {
	unexpectedError: {
		code: "UNEXPECTED_ERROR",
		message: "Unexpected error"
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
	}
}

export const validationErrors = {}
