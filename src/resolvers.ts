import { ResolverContext } from "./types.js"
import { cachingResolver } from "./services/cachingService.js"
import * as toyResolvers from "./resolvers/toy.js"

export const resolvers = {
	Query: {
		retrieveToy: (
			parent: any,
			args: any,
			context: ResolverContext,
			info: any
		) =>
			cachingResolver(parent, args, context, info, toyResolvers.retrieveToy),
		listToys: (
			parent: any,
			args: any,
			context: ResolverContext,
			info: any
		) => cachingResolver(parent, args, context, info, toyResolvers.listToys)
	}
}
