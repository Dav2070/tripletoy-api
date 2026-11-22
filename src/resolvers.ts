import { ResolverContext } from "./types.js"
import type { ToyCategory } from "./generated/prisma/client.js"
import { cachingResolver } from "./services/cachingService.js"
import * as toyResolvers from "./resolvers/toy.js"
import * as checkoutSessionResolvers from "./resolvers/checkoutSession.js"
import * as drawingResolvers from "./resolvers/drawing.js"
import * as eventResolvers from "./resolvers/event.js"
import * as profileResolvers from "./resolvers/profile.js"
import * as chatResolvers from "./resolvers/chat.js"
import { chatUserIds, isToyOfNormalUser } from "./services/chatService.js"
import { retrievePublicUser } from "./services/userService.js"
import { admins } from "./constants.js"
import { calculateAge } from "./services/ageService.js"
import { getPhotoUrl } from "./services/photoStorage.js"

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
		listDrawingToys: (
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
				toyResolvers.listDrawingToys
			),
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
			),
		// The chats are private, so they are never cached
		listMyChats: chatResolvers.listMyChats,
		retrieveChat: chatResolvers.retrieveChat,
		listChatMessages: chatResolvers.listChatMessages,
		retrieveMyUnreadChatsCount: chatResolvers.retrieveMyUnreadChatsCount
	},
	Chat: {
		partner: async (
			chat: { user1Id: bigint; user2Id: bigint },
			args: any,
			context: ResolverContext
		) => {
			const partnerId =
				chat.user1Id == BigInt(context.user.Id) ? chat.user2Id : chat.user1Id

			return (
				(await retrievePublicUser(Number(partnerId))) ?? {
					firstName: "",
					profileImage: null
				}
			)
		},
		toys: (
			chat: { user1Id: bigint; user2Id: bigint },
			args: any,
			context: ResolverContext
		) =>
			context.prisma.toy.findMany({
				where: {
					category: "NORMAL",
					OR: [
						{ userId: chat.user1Id, order: { buyerId: chat.user2Id } },
						{ userId: chat.user2Id, order: { buyerId: chat.user1Id } }
					]
				},
				include: { photos: { orderBy: { id: "asc" } } },
				orderBy: { soldAt: "desc" }
			}),
		lastMessage: (
			chat: { id: bigint },
			args: any,
			context: ResolverContext
		) =>
			context.prisma.chatMessage.findFirst({
				where: { chatId: chat.id },
				orderBy: { id: "desc" }
			}),
		unreadCount: (
			chat: {
				id: bigint
				user1Id: bigint
				user1ReadAt: Date | null
				user2ReadAt: Date | null
			},
			args: any,
			context: ResolverContext
		) => {
			const userId = BigInt(context.user.Id)
			const readAt =
				chat.user1Id == userId ? chat.user1ReadAt : chat.user2ReadAt

			return context.prisma.chatMessage.count({
				where: {
					chatId: chat.id,
					userId: { not: userId },
					...(readAt != null ? { createdAt: { gt: readAt } } : {})
				}
			})
		},
		createdAt: (chat: { createdAt: Date }) => chat.createdAt.toISOString()
	},
	ChatMessage: {
		mine: (
			message: { userId: bigint },
			args: any,
			context: ResolverContext
		) => context.user != null && BigInt(context.user.Id) == message.userId,
		createdAt: (message: { createdAt: Date }) =>
			message.createdAt.toISOString()
	},
	ToyPhoto: {
		url: (photo: { fileName: string }) => getPhotoUrl(photo.fileName)
	},
	Drawing: {
		url: (drawing: { fileName: string }) => getPhotoUrl(drawing.fileName),
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
		handover: (toy: { userId: bigint; category: ToyCategory }) =>
			isToyOfNormalUser(toy),
		chatUuid: async (
			toy: {
				id: bigint
				userId: bigint
				category: ToyCategory
				soldAt: Date | null
			},
			args: any,
			context: ResolverContext
		) => {
			if (context.user == null || toy.soldAt == null || !isToyOfNormalUser(toy))
				return null

			const order = await context.prisma.toyOrder.findUnique({
				where: { toyId: toy.id }
			})
			const userId = BigInt(context.user.Id)

			if (order == null || (userId != toy.userId && userId != order.buyerId))
				return null

			const chat = await context.prisma.chat.findUnique({
				where: { user1Id_user2Id: chatUserIds(toy.userId, order.buyerId) }
			})

			return chat?.uuid ?? null
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
		updateToyCategory: toyResolvers.updateToyCategory,
		deleteToy: toyResolvers.deleteToy,
		createDrawingCheckoutSession:
			checkoutSessionResolvers.createDrawingCheckoutSession,
		createToyCheckoutSession:
			checkoutSessionResolvers.createToyCheckoutSession,
		updateMyProfile: profileResolvers.updateMyProfile,
		sendChatMessage: chatResolvers.sendChatMessage,
		markChatAsRead: chatResolvers.markChatAsRead
	}
}
