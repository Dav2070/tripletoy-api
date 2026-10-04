import { ApolloServer } from "@apollo/server"
import { expressMiddleware } from "@as-integrations/express5"
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer"
import express from "express"
import http from "node:http"
import cors from "cors"
import { retrieveUserByAccessToken } from "./services/userService.js"
import { createPhotosRouter } from "./routes/photos.js"
import { setupDavWebhook } from "./endpoints/davWebhook.js"
import { invalidateCache } from "./services/cachingService.js"
import { createSchema } from "./schema.js"
import type { AppDependencies } from "./appDependencies.js"
import type { ResolverContext } from "./types.js"

// Creates the application without opening connections or listening on a port.
// The caller owns the injected clients and must close them after server.stop().
export async function createApp(dependencies: AppDependencies) {
	BigInt.prototype["toJSON"] = function () {
		return this.toString()
	}

	const app = express()
	const httpServer = http.createServer(app)
	const server = new ApolloServer<ResolverContext>({
		schema: createSchema(),
		plugins: [
			ApolloServerPluginDrainHttpServer({ httpServer }),
			{
				async requestDidStart() {
					return {
						async willSendResponse({ operation }) {
							if (operation?.operation === "mutation")
								await invalidateCache(dependencies.redis)
						}
					}
				}
			}
		],
		introspection: true
	})
	await server.start()

	app.use(cors<cors.CorsRequest>(), createPhotosRouter(dependencies))
	setupDavWebhook(app, dependencies)

	app.use(
		"/",
		cors<cors.CorsRequest>(),
		express.json({ type: "application/json", limit: "50mb" }),
		expressMiddleware(server, {
			context: async ({ req }) => {
				const accessToken = req.headers.authorization
				const user = await retrieveUserByAccessToken(accessToken)

				return {
					prisma: dependencies.prisma,
					redis: dependencies.redis,
					accessToken,
					user
				}
			}
		})
	)

	return { app, server, httpServer }
}
