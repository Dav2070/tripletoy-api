import express, { Express, Request, Response } from "express"
import { timingSafeEqual } from "node:crypto"
import { Auth, OrdersController, OrderResource } from "dav-js"
import type { Drawing } from "../generated/prisma/client.js"
import { invalidateCache } from "../services/cachingService.js"
import type { AppDependencies } from "../appDependencies.js"

function isAuthorized(header: string | undefined): boolean {
	const key = process.env.DAV_WEBHOOK_KEY
	if (!key || !header) return false

	const expected = Buffer.from(key)
	const actual = Buffer.from(header)
	return actual.length == expected.length && timingSafeEqual(actual, expected)
}

/** Saves the paid order of a drawing and marks the drawing as received */
async function completeDrawingOrder(
	{ prisma, redis }: AppDependencies,
	drawing: Drawing,
	order: OrderResource,
	address: NonNullable<OrderResource["shippingAddress"]>,
	orderUuid: string
) {
	// dav repeats the webhook until it gets a 200, so this must be idempotent
	const existingOrder = await prisma.drawingOrder.findFirst({
		where: { OR: [{ orderUuid }, { drawingId: drawing.id }] }
	})

	if (existingOrder != null) {
		if (existingOrder.orderUuid != orderUuid) {
			console.error(
				`Drawing ${drawing.uuid} was paid twice (orders ${existingOrder.orderUuid} and ${orderUuid}), one of them must be refunded`
			)
		}

		return
	}

	await prisma.$transaction([
		prisma.drawingOrder.create({
			data: {
				orderUuid,
				drawingId: drawing.id,
				buyerId: BigInt(order.user.id),
				price: order.price,
				name: address.name,
				email: address.email,
				phone: address.phone || null,
				line1: address.line1,
				line2: address.line2 || null,
				postalCode: address.postalCode,
				city: address.city,
				state: address.state || null,
				country: address.country
			}
		}),
		prisma.drawing.update({
			where: { id: drawing.id },
			data: { status: "RECEIVED" }
		})
	])

	await invalidateCache(redis)
}

// dav calls this url (the webhook url of the app in the dav dashboard) when an order was paid
async function davWebhook(
	req: Request,
	res: Response,
	deps: AppDependencies
) {
	const { prisma, redis } = deps
	if (!isAuthorized(req.headers["authorization"])) return res.sendStatus(401)
	if (typeof req.body?.type !== "string") return res.sendStatus(400)
	if (req.body.type != "order.completed") return res.sendStatus(200)

	const orderUuid = req.body.uuid
	if (
		typeof orderUuid !== "string" ||
		orderUuid.length == 0 ||
		orderUuid.length > 128
	)
		return res.sendStatus(400)

	const orderResponse = await OrdersController.retrieveOrder(
		`
			uuid
			price
			user {
				id
			}
			tableObject {
				uuid
			}
			shippingAddress {
				name
				email
				phone
				city
				country
				line1
				line2
				postalCode
				state
			}
		`,
		{
			auth: new Auth({
				apiKey: process.env.DAV_API_KEY,
				secretKey: process.env.DAV_SECRET_KEY,
				uuid: process.env.DAV_UUID
			}),
			uuid: orderUuid
		}
	)

	if (orderResponse == null || Array.isArray(orderResponse)) {
		return res.sendStatus(502)
	}

	const order = orderResponse as OrderResource
	const address = order.shippingAddress

	if (!order.tableObject?.uuid || order.user?.id == null || !address) {
		return res.sendStatus(502)
	}

	const toy = await prisma.toy.findFirst({
		where: { uuid: order.tableObject.uuid }
	})

	if (toy == null) {
		const drawing = await prisma.drawing.findFirst({
			where: { uuid: order.tableObject.uuid }
		})

		// The table object belongs to something else than a toy or a drawing
		if (drawing == null) return res.sendStatus(404)

		await completeDrawingOrder(deps, drawing, order, address, orderUuid)
		return res.sendStatus(200)
	}

	// dav repeats the webhook until it gets a 200, so this must be idempotent
	const existingOrder = await prisma.toyOrder.findFirst({
		where: { OR: [{ orderUuid }, { toyId: toy.id }] }
	})

	if (existingOrder != null) {
		if (existingOrder.orderUuid != orderUuid) {
			// Two buyers paid for the same toy at the same time
			console.error(
				`Toy ${toy.uuid} was paid twice (orders ${existingOrder.orderUuid} and ${orderUuid}), one of them must be refunded`
			)
		}

		return res.sendStatus(200)
	}

	await prisma.$transaction([
		prisma.toyOrder.create({
			data: {
				orderUuid,
				toyId: toy.id,
				buyerId: BigInt(order.user.id),
				price: order.price,
				name: address.name,
				email: address.email,
				phone: address.phone || null,
				line1: address.line1,
				line2: address.line2 || null,
				postalCode: address.postalCode,
				city: address.city,
				state: address.state || null,
				country: address.country
			}
		}),
		prisma.toy.update({
			where: { id: toy.id },
			data: { soldAt: new Date() }
		})
	])

	await invalidateCache(redis)
	return res.sendStatus(200)
}

export function setupDavWebhook(app: Express, dependencies: AppDependencies) {
	app.post("/davWebhook", express.json(), async (req, res) => {
		try {
			await davWebhook(req, res, dependencies)
		} catch (error) {
			console.error("dav webhook failed", error)
			res.sendStatus(500)
		}
	})
}
