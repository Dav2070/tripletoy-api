import type { Prisma, PrismaClient, Toy } from "../generated/prisma/client.js"
import { admins } from "../constants.js"

/** Normal users are all users except the admins */
export function isNormalUser(userId: bigint | number): boolean {
	return !admins.includes(Number(userId))
}

/**
 * Whether the toy is sold by a normal user. These toys are handed over in person, so the
 * checkout asks for no shipping address and the buyer and the seller get a chat.
 */
export function isToyOfNormalUser(toy: Pick<Toy, "category" | "userId">): boolean {
	return toy.category == "NORMAL" && isNormalUser(toy.userId)
}

/** The ids of a chat are stored in ascending order, so that there is only one chat per pair */
export function chatUserIds(a: bigint, b: bigint) {
	return a < b ? { user1Id: a, user2Id: b } : { user1Id: b, user2Id: a }
}

/** Returns the chat between the two users, it is created if it does not exist yet */
export async function findOrCreateChat(
	prisma: PrismaClient | Prisma.TransactionClient,
	a: bigint,
	b: bigint
) {
	const ids = chatUserIds(a, b)

	return await prisma.chat.upsert({
		where: { user1Id_user2Id: ids },
		create: ids,
		update: {}
	})
}

/** Returns the chat with the uuid if the user is one of its users, otherwise null */
export async function findChatOfUser(
	prisma: PrismaClient,
	uuid: string,
	userId: bigint
) {
	return await prisma.chat.findFirst({
		where: { uuid, OR: [{ user1Id: userId }, { user2Id: userId }] }
	})
}
