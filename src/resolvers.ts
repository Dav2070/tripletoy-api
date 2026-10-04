import { ResolverContext } from "./types.js"
import { cachingResolver } from "./services/cachingService.js"
import * as toyResolvers from "./resolvers/toy.js"
import * as checkoutSessionResolvers from "./resolvers/checkoutSession.js"
import * as profileResolvers from "./resolvers/profile.js"

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
		) => cachingResolver(parent, args, context, info, toyResolvers.listToys),
		listMyToys: (
			parent: any,
			args: any,
			context: ResolverContext,
			info: any
		) =>
			cachingResolver(parent, args, context, info, toyResolvers.listMyToys),
		retrieveMyProfile: (
			parent: any,
			args: any,
			context: ResolverContext,
			info: any
		) =>
			cachingResolver(
				parent,
				args,
				context,
				info,
				profileResolvers.retrieveMyProfile
			)
	},
	ToyPhoto: {
		url: (photo: { fileName: string }) => `/photos/${photo.fileName}`
	},
	ToyOrder: {
		createdAt: (order: { createdAt: Date }) => order.createdAt.toISOString()
	},
	Toy: {
		sold: (toy: { soldAt: Date | null }) => toy.soldAt != null,
		mine: (toy: { userId: bigint }, args: any, context: ResolverContext) =>
			context.user != null && BigInt(context.user.Id) == toy.userId,
		// Only the seller may see who bought the toy
		order: async (
			toy: { id: bigint; userId: bigint },
			args: any,
			context: ResolverContext
		) => {
			if (context.user == null || BigInt(context.user.Id) != toy.userId)
				return null

			return await context.prisma.toyOrder.findUnique({
				where: { toyId: toy.id }
			})
		},
		createdAt: (toy: { createdAt: Date }) => toy.createdAt.toISOString(),
		updatedAt: (toy: { updatedAt: Date }) => toy.updatedAt.toISOString()
	},
	Mutation: {
		createToy: toyResolvers.createToy,
		updateToy: toyResolvers.updateToy,
		deleteToy: toyResolvers.deleteToy,
		createToyCheckoutSession:
			checkoutSessionResolvers.createToyCheckoutSession,
		updateMyProfile: profileResolvers.updateMyProfile
	}
}
