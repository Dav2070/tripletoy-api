import { PrismaClient } from "./generated/prisma/client.js"
import { RedisClientType } from "redis"
import { User } from "dav-js"

export interface ResolverContext {
	prisma: PrismaClient
	redis: RedisClientType
	accessToken?: string
	user?: User
}

export interface QueryResult<T> {
	caching: boolean
	data: T
}

export interface List<T> {
	total: number
	items: T[]
}

export interface ApiError {
	code: string
	message: string
	status?: number
}
