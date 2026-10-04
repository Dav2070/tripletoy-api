import { CheckoutSessionsController, TableObjectPriceType } from "dav-js"
import { throwApiError } from "../utils.js"
import { apiErrors } from "../errors.js"
import { publicUrl } from "../constants.js"
import { ResolverContext } from "../types.js"

/** Creates the dav (Stripe) checkout session for buying a toy */
export async function createToyCheckoutSession(
	parent: any,
	args: { uuid: string; successUrl: string; cancelUrl: string },
	context: ResolverContext
): Promise<{ url: string }> {
	const toy = await context.prisma.toy.findFirst({
		where: { uuid: args.uuid },
		include: { photos: { orderBy: { id: "asc" }, take: 1 } }
	})

	if (toy == null) throwApiError(apiErrors.toyDoesNotExist)
	if (toy.soldAt != null) throwApiError(apiErrors.toyAlreadySold)
	if (toy.userId == BigInt(context.user.Id))
		throwApiError(apiErrors.cannotBuyOwnToy)

	// The checkout needs an image url, use the placeholder of the website if there is no photo
	const productImage =
		toy.photos.length > 0
			? `${publicUrl}/photos/${toy.photos[0].fileName}`
			: new URL("/assets/images/toy-placeholder.svg", args.successUrl).href

	const response =
		await CheckoutSessionsController.createPaymentCheckoutSession("url", {
			accessToken: context.accessToken,
			tableObjectUuid: toy.uuid,
			type: TableObjectPriceType.Order,
			price: toy.price,
			currency: "EUR",
			productName: toy.title,
			productImage,
			successUrl: args.successUrl,
			cancelUrl: args.cancelUrl
		})

	const url = Array.isArray(response) ? null : response?.url

	if (!url) {
		console.error("Could not create the checkout session", response)
		throwApiError(apiErrors.unexpectedError)
	}

	return { url }
}
