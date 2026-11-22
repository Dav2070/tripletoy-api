import type { Chat, ChatMessage } from "../generated/prisma/client.js"
import { throwApiError, throwValidationError } from "../utils.js"
import { apiErrors, validationErrors } from "../errors.js"
import {
	chatMessageMaxLength,
	chatMessagesDefaultLimit,
	chatMessagesMaxLimit
} from "../constants.js"
import { findChatOfUser } from "../services/chatService.js"
import { sendNewChatMessageEmail } from "../services/userEmailService.js"
import { ResolverContext } from "../types.js"

// Nobody has more chats than this, every chat needs a purchase
const chatsMax = 200

export interface ChatMessageList {
	/** Whether there are older messages than the returned ones */
	hasMore: boolean
	/** The messages, the oldest first */
	items: ChatMessage[]
}

async function getChat(context: ResolverContext, uuid: string): Promise<Chat> {
	const chat = await findChatOfUser(
		context.prisma,
		uuid,
		BigInt(context.user.Id)
	)

	// Other users must not learn that the chat exists
	if (chat == null) throwApiError(apiErrors.chatDoesNotExist)
	return chat
}

/** Lists the chats of the logged in user, the chat with the latest message first */
export async function listMyChats(
	parent: any,
	args: any,
	context: ResolverContext
): Promise<Chat[]> {
	const userId = BigInt(context.user.Id)

	return await context.prisma.chat.findMany({
		where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
		orderBy: [
			{ lastMessageAt: { sort: "desc", nulls: "last" } },
			{ createdAt: "desc" }
		],
		take: chatsMax
	})
}

export async function retrieveChat(
	parent: any,
	args: { uuid: string },
	context: ResolverContext
): Promise<Chat | null> {
	return await findChatOfUser(
		context.prisma,
		args.uuid,
		BigInt(context.user.Id)
	)
}

/**
 * Lists the messages of a chat, the oldest first. Without before and after the latest
 * messages are returned. With before the older messages are returned, with after the
 * newer ones, e.g. for checking for new messages.
 */
export async function listChatMessages(
	parent: any,
	args: { chatUuid: string; limit?: number; before?: string; after?: string },
	context: ResolverContext
): Promise<ChatMessageList> {
	const chat = await getChat(context, args.chatUuid)
	const limit = Math.min(
		Math.max(args.limit ?? chatMessagesDefaultLimit, 1),
		chatMessagesMaxLimit
	)

	// The cursor must be a message of the same chat
	const findCursor = async (uuid: string) => {
		const message = await context.prisma.chatMessage.findFirst({
			where: { uuid, chatId: chat.id }
		})

		if (message == null) throwApiError(apiErrors.chatDoesNotExist)
		return message.id
	}

	if (args.after != null) {
		const afterId = await findCursor(args.after)
		const items = await context.prisma.chatMessage.findMany({
			where: { chatId: chat.id, id: { gt: afterId } },
			orderBy: { id: "asc" },
			take: chatMessagesMaxLimit
		})

		return { hasMore: false, items }
	}

	const beforeId = args.before != null ? await findCursor(args.before) : null
	const items = await context.prisma.chatMessage.findMany({
		where: {
			chatId: chat.id,
			...(beforeId != null ? { id: { lt: beforeId } } : {})
		},
		orderBy: { id: "desc" },
		take: limit + 1
	})

	return {
		hasMore: items.length > limit,
		items: items.slice(0, limit).reverse()
	}
}

/** Counts the chats of the logged in user with messages they have not read yet */
export async function retrieveMyUnreadChatsCount(
	parent: any,
	args: any,
	context: ResolverContext
): Promise<number> {
	const userId = BigInt(context.user.Id)

	const chats = await context.prisma.chat.findMany({
		where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
		select: { id: true, user1Id: true, user1ReadAt: true, user2ReadAt: true },
		take: chatsMax
	})
	if (chats.length == 0) return 0

	// One message of the partner after the last visit is enough for every chat
	const unread = await context.prisma.chatMessage.findMany({
		where: {
			OR: chats.map(chat => {
				const readAt =
					chat.user1Id == userId ? chat.user1ReadAt : chat.user2ReadAt

				return {
					chatId: chat.id,
					userId: { not: userId },
					...(readAt != null ? { createdAt: { gt: readAt } } : {})
				}
			})
		},
		distinct: ["chatId"],
		select: { chatId: true }
	})

	return unread.length
}

export async function sendChatMessage(
	parent: any,
	args: { chatUuid: string; text: string },
	context: ResolverContext
): Promise<ChatMessage> {
	const chat = await getChat(context, args.chatUuid)
	const userId = BigInt(context.user.Id)
	const text = (args.text ?? "").trim()

	throwValidationError(
		text.length == 0 ? validationErrors.messageTextTooShort : null,
		text.length > chatMessageMaxLength
			? validationErrors.messageTextTooLong
			: null
	)

	const isUser1 = chat.user1Id == userId
	const recipientId = isUser1 ? chat.user2Id : chat.user1Id
	const recipientReadAt = isUser1 ? chat.user2ReadAt : chat.user1ReadAt

	// Only the first message the recipient has not read yet is sent by email, so that
	// they don't get an email for every message
	const notify =
		(await context.prisma.chatMessage.count({
			where: {
				chatId: chat.id,
				userId,
				...(recipientReadAt != null
					? { createdAt: { gt: recipientReadAt } }
					: {})
			}
		})) == 0

	const now = new Date()
	const [message] = await context.prisma.$transaction([
		context.prisma.chatMessage.create({
			data: { chatId: chat.id, userId, text, createdAt: now }
		}),
		// The sender has read everything up to their own message
		context.prisma.chat.update({
			where: { id: chat.id },
			data: {
				lastMessageAt: now,
				...(isUser1 ? { user1ReadAt: now } : { user2ReadAt: now })
			}
		})
	])

	if (notify) {
		// The email must not delay the response, it never throws
		void sendNewChatMessageEmail({
			recipientId,
			senderId: userId,
			chatUuid: chat.uuid,
			messageUuid: message.uuid,
			text
		})
	}

	return message
}

/** Saves that the logged in user has read all messages of the chat */
export async function markChatAsRead(
	parent: any,
	args: { chatUuid: string },
	context: ResolverContext
): Promise<Chat> {
	const chat = await getChat(context, args.chatUuid)
	const now = new Date()

	return await context.prisma.chat.update({
		where: { id: chat.id },
		data:
			chat.user1Id == BigInt(context.user.Id)
				? { user1ReadAt: now }
				: { user2ReadAt: now }
	})
}
