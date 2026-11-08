import { Drawing } from "../generated/prisma/client.js"
import { ResolverContext, QueryResult, List } from "../types.js"

/** Lists the drawings of the logged in user, the latest first */
export async function listMyDrawings(
	parent: any,
	args: { limit?: number; offset?: number },
	context: ResolverContext
): Promise<QueryResult<List<Drawing>>> {
	let take = args.limit || 24
	if (take <= 0) take = 24

	let skip = args.offset || 0
	if (skip < 0) skip = 0

	const where = { userId: BigInt(context.user.Id) }

	const [total, items] = await context.prisma.$transaction([
		context.prisma.drawing.count({ where }),
		context.prisma.drawing.findMany({
			where,
			orderBy: { id: "desc" },
			take,
			skip
		})
	])

	return { caching: false, data: { total, items } }
}
