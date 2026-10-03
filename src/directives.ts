import { defaultFieldResolver } from "graphql"
import { mapSchema, getDirective, MapperKind } from "@graphql-tools/utils"
import { User } from "dav-js"
import { throwApiError } from "./utils.js"
import { apiErrors } from "./errors.js"
import { admins } from "./constants.js"

export const authDirectiveTransformer = (schema, directiveName) => {
	return mapSchema(schema, {
		[MapperKind.OBJECT_FIELD]: fieldConfig => {
			const authDirective = getDirective(schema, fieldConfig, directiveName)

			if (authDirective) {
				const { resolve = defaultFieldResolver } = fieldConfig
				const { role } = authDirective[0]

				fieldConfig.resolve = async (parent, args, context, info) => {
					const user: User = context.user

					if (user == null) {
						throwApiError(apiErrors.notAuthenticated)
					}

					if (role == "ADMIN" && !admins.includes(user.Id)) {
						throwApiError(apiErrors.actionNotAllowed)
					}

					return await resolve(parent, args, context, info)
				}

				return fieldConfig
			}
		}
	})
}
