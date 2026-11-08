import { ResolverContext } from "./types.js"
import { cachingResolver } from "./services/cachingService.js"
import * as toyResolvers from "./resolvers/toy.js"
import * as checkoutSessionResolvers from "./resolvers/checkoutSession.js"
import * as drawingResolvers from "./resolvers/drawing.js"
import * as eventResolvers from "./resolvers/event.js"
import * as profileResolvers from "./resolvers/profile.js"
import { admins } from "./constants.js"
import { calculateAge } from "./services/ageService.js"

export const resolvers = {
	Query: {
		retrieveToy: (
			parent: any,
			args: any,
			context: ResolverContext,
			info: any
		) =>
			cachingResolver(parent, args, context, info, toyResolvers.retrieveToy),
		listToys: (parent: any, args: any, context: ResolverContext, info: any) =>
			cachingResolver(parent, args, context, info, toyResolvers.listToys),
		listFixedToys: (
			parent: any,
			args: any,
			context: ResolverContext,
			info: any
		) =>
			cachingResolver(parent, args, context, info, toyResolvers.listFixedToys),
		listJewelry: (
			parent: any,
			args: any,
			context: ResolverContext,
			info: any
		) => cachingResolver(parent, args, context, info, toyResolvers.listJewelry),
		listEvents: (parent: any, args: any, context: ResolverContext, info: any) =>
			cachingResolver(parent, args, context, info, eventResolvers.listEvents),
		listAllEvents: eventResolvers.listAllEvents,
		listToyLocations: (
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
				toyResolvers.listToyLocations
			),
		listMyToys: (
			parent: any,
			args: any,
			context: ResolverContext,
			info: any
		) =>
			cachingResolver(parent, args, context, info, toyResolvers.listMyToys),
		retrieveMyToyStats: (
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
				toyResolvers.retrieveMyToyStats
			),
		listMyPurchases: (
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
				toyResolvers.listMyPurchases
			),
		listMyDrawings: (
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
				drawingResolvers.listMyDrawings
			),
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
	Drawing: {
		url: (drawing: { fileName: string }) => `/photos/${drawing.fileName}`,
		createdAt: (drawing: { createdAt: Date }) =>
			drawing.createdAt.toISOString(),
		updatedAt: (drawing: { updatedAt: Date }) =>
			drawing.updatedAt.toISOString()
	},
	Profile: {
		isAdmin: (profile: any, args: any, context: ResolverContext) =>
			context.user != null && admins.includes(context.user.Id),
		age: (profile: { birthDate?: Date | null }) =>
			profile.birthDate ? calculateAge(profile.birthDate) : null,
		birthDate: (profile: { birthDate?: Date | null }) =>
			profile.birthDate
				? profile.birthDate.toISOString().slice(0, 10)
				: null,
		address: (profile: {
			addressName?: string | null
			addressLine1?: string | null
			addressLine2?: string | null
			addressPostalCode?: string | null
			addressCity?: string | null
			addressCountry?: string | null
		}) => ({
			name: profile.addressName ?? null,
			line1: profile.addressLine1 ?? null,
			line2: profile.addressLine2 ?? null,
			postalCode: profile.addressPostalCode ?? null,
			city: profile.addressCity ?? null,
			country: profile.addressCountry ?? null
		})
	},
	Event: {
		distance: (event: { distance?: number | null }) => event.distance ?? null,
		startsAt: (event: { startsAt: Date }) => event.startsAt.toISOString(),
		endsAt: (event: { endsAt: Date | null }) =>
			event.endsAt?.toISOString() ?? null,
		createdAt: (event: { createdAt: Date }) => event.createdAt.toISOString(),
		updatedAt: (event: { updatedAt: Date }) => event.updatedAt.toISOString()
	},
	ToyOrder: {
		createdAt: (order: { createdAt: Date }) => order.createdAt.toISOString()
	},
	Toy: {
		sold: (toy: { soldAt: Date | null }) => toy.soldAt != null,
		distance: (toy: { distance?: number | null }) => toy.distance ?? null,
		mine: (toy: { userId: bigint }, args: any, context: ResolverContext) =>
			context.user != null && BigInt(context.user.Id) == toy.userId,
		bought: async (
			toy: { id: bigint },
			args: any,
			context: ResolverContext
		) =>
			context.user != null &&
			(await context.prisma.toyOrder.count({
				where: { toyId: toy.id, buyerId: BigInt(context.user.Id) }
			})) > 0,
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
		createEvent: eventResolvers.createEvent,
		updateEvent: eventResolvers.updateEvent,
		deleteEvent: eventResolvers.deleteEvent,
		createToy: toyResolvers.createToy,
		updateToy: toyResolvers.updateToy,
		deleteToy: toyResolvers.deleteToy,
		createDrawingCheckoutSession:
			checkoutSessionResolvers.createDrawingCheckoutSession,
		createToyCheckoutSession:
			checkoutSessionResolvers.createToyCheckoutSession,
		updateMyProfile: profileResolvers.updateMyProfile
	}
}
