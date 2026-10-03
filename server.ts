import "dotenv/config"
import { createClient } from "redis"
import { Dav, Environment } from "dav-js"
import { createPrismaClient } from "./src/prisma.js"
import { createApp } from "./src/app.js"

const port = process.env.PORT || 4002
const prisma = createPrismaClient()
const redis = createClient({
	url: process.env.REDIS_URL,
	database:
		process.env.ENV == "production" ? 13 : process.env.ENV == "test" ? 14 : 12 // production: 13, staging: 12, test: 14
})
redis.on("error", err => console.log("Redis Client Error", err))
await redis.connect()

let environment = Environment.Development

switch (process.env.ENV) {
	case "production":
		environment = Environment.Production
		break
	case "staging":
		environment = Environment.Staging
		break
}

new Dav({
	environment,
	server: true
})

const { httpServer } = await createApp({ prisma, redis })

await new Promise<void>(resolve => httpServer.listen({ port }, resolve))
const address = httpServer.address()
const listeningPort =
	typeof address === "object" && address ? address.port : port
console.log(`🚀 Server ready at http://localhost:${listeningPort}/`)
