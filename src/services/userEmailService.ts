import { renderEmail, sendEmail } from "./emailService.js"
import { retrieveUserContact } from "./userService.js"
import { websiteUrl } from "../constants.js"

// The emails to the users are in German, like the default language of the website
const messagePreviewMaxLength = 300

const formatPrice = (cents: number) =>
	`${(cents / 100).toFixed(2)} €`.replace(".", ",")

const chatUrl = (chatUuid: string) => `${websiteUrl}/chats/${chatUuid}`

// Names are entered by the users, they must not break the subject line
const cleanName = (name: string, fallback: string) =>
	name.replace(/\s+/g, " ").trim().slice(0, 50) || fallback

function preview(text: string): string {
	return text.length > messagePreviewMaxLength
		? `${text.slice(0, messagePreviewMaxLength).trimEnd()}…`
		: text
}

/**
 * Notifies the recipient of a chat message by email. It never throws, so it can be called
 * without waiting for it.
 */
export async function sendNewChatMessageEmail(params: {
	recipientId: bigint
	senderId: bigint
	chatUuid: string
	messageUuid: string
	text: string
}) {
	const [recipient, sender] = await Promise.all([
		retrieveUserContact(Number(params.recipientId)),
		retrieveUserContact(Number(params.senderId))
	])
	if (recipient == null) return

	const senderName = cleanName(sender?.firstName ?? "", "Jemand")

	await sendEmail([recipient.email], {
		subject: `Neue Nachricht von ${senderName}`,
		html: renderEmail(
			`Neue Nachricht von ${senderName}`,
			`Hallo ${cleanName(recipient.firstName, "du")}, du hast eine neue Nachricht auf 3pletoy bekommen.`,
			[{ rows: [["Nachricht", preview(params.text)]] }],
			{
				button: { text: "Nachricht lesen", url: chatUrl(params.chatUuid) },
				footer:
					"Du bekommst diese E-Mail, weil du ein Spielzeug auf 3pletoy gekauft oder verkauft hast. Über weitere Nachrichten in diesem Chat informieren wir dich erst wieder, wenn du ihn gelesen hast."
			}
		),
		idempotencyKey: `chat-message/${params.messageUuid}`
	})
}

/**
 * Notifies the seller and the buyer of a toy that is handed over in person, both get the
 * link to their chat. It never throws.
 */
export async function sendToyHandoverEmails(params: {
	orderUuid: string
	toy: { uuid: string; title: string }
	price: number
	sellerId: bigint
	buyerId: bigint
	chatUuid: string
}) {
	const [seller, buyer] = await Promise.all([
		retrieveUserContact(Number(params.sellerId)),
		retrieveUserContact(Number(params.buyerId))
	])

	const rows: Array<[string, string]> = [
		["Spielzeug", params.toy.title],
		["Preis", formatPrice(params.price)]
	]
	const toyUrl = `${websiteUrl}/toy/${params.toy.uuid}`
	const button = { text: "Zum Chat", url: chatUrl(params.chatUuid) }
	const emails: Promise<void>[] = []

	if (seller != null) {
		const buyerName = cleanName(buyer?.firstName ?? "", "Der Käufer")

		emails.push(
			sendEmail([seller.email], {
				subject: `Verkauft: ${params.toy.title}`,
				html: renderEmail(
					"Dein Spielzeug wurde verkauft!",
					`Hallo ${cleanName(seller.firstName, "du")}, ${buyerName} hat dein Spielzeug gekauft und bezahlt. Vereinbart im Chat, wo und wann ihr das Spielzeug übergebt.`,
					[{ rows: [...rows, ["Käufer", buyerName], ["Link", toyUrl]] }],
					{ button }
				),
				idempotencyKey: `toy-sold/${params.orderUuid}`
			})
		)
	}

	if (buyer != null) {
		const sellerName = cleanName(seller?.firstName ?? "", "Der Verkäufer")

		emails.push(
			sendEmail([buyer.email], {
				subject: `Danke für deinen Kauf: ${params.toy.title}`,
				html: renderEmail(
					"Danke für deinen Kauf!",
					`Hallo ${cleanName(buyer.firstName, "du")}, du hast ein Spielzeug von ${sellerName} gekauft. Schreib ${sellerName} im Chat, um die Übergabe zu vereinbaren.`,
					[{ rows: [...rows, ["Verkäufer", sellerName], ["Link", toyUrl]] }],
					{ button }
				),
				idempotencyKey: `toy-bought/${params.orderUuid}`
			})
		)
	}

	await Promise.all(emails)
}
