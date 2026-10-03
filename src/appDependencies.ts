import type { ResolverContext } from "./types.js"

export interface AppDependencies
	extends Pick<ResolverContext, "prisma" | "redis"> {}
