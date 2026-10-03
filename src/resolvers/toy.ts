import { Toy } from "../generated/prisma/client.js"
import { ResolverContext, QueryResult, List } from "../types.js"

export async function retrieveToy(
	parent: any,
	args: { uuid: string },
	context: ResolverContext
): Promise<QueryResult<Toy>> {
	return {
		caching: true,
		data: await context.prisma.toy.findFirst({
			where: { uuid: args.uuid }
		})
	}
}

export async function listToys(
	parent: any,
	args: { limit?: number; offset?: number },
	context: ResolverContext
): Promise<QueryResult<List<Toy>>> {
	let take = args.limit || 10
	if (take <= 0) take = 10

	let skip = args.offset || 0
	if (skip < 0) skip = 0

	let [total, items] = await context.prisma.$transaction([
		context.prisma.toy.count(),
		context.prisma.toy.findMany({
			orderBy: { id: "desc" },
			take,
			skip
		})
	])

	return {
		caching: true,
		data: { total, items }
	}
}
