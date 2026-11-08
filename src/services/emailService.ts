import { readFile } from "node:fs/promises"
import path from "node:path"
import { Resend } from "resend"
import { uploadsRoot } from "./photoStorage.js"

export interface EmailAttachment {
	filename: string
	content: Buffer
}

let resend: Resend | null = null

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
}

type Rows = Array<[label: string, value: string | null | undefined]>
type Section = { heading?: string; rows: Rows }

const accent = "#e8590c"

function renderSection(section: Section): string {
	const rows = section.rows
		.filter(([, value]) => value != null && value !== "")
		.map(
			([label, value]) =>
				`<tr>
					<td style="padding:6px 16px 6px 0;color:#6b7280;font-size:14px;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>
					<td style="padding:6px 0;color:#111827;font-size:14px;vertical-align:top">${escapeHtml(value)}</td>
				</tr>`
		)
		.join("")

	const heading = section.heading
		? `<h3 style="margin:24px 0 4px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${accent}">${escapeHtml(section.heading)}</h3>`
		: ""

	return `${heading}<table role="presentation" style="border-collapse:collapse">${rows}</table>`
}

/** Renders the sections as a html email with a header and a card, the values are escaped */
export function renderEmail(
	title: string,
	intro: string,
	sections: Section[]
): string {
	return `<!doctype html>
<html>
<body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:Roboto,Arial,sans-serif">
	<table role="presentation" align="center" width="100%" style="max-width:560px;border-collapse:collapse">
		<tr>
			<td style="background:${accent};color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0;font-size:20px;font-weight:600">3pletoy</td>
		</tr>
		<tr>
			<td style="background:#ffffff;padding:24px;border-radius:0 0 12px 12px">
				<h2 style="margin:0 0 4px;font-size:20px;color:#111827">${escapeHtml(title)}</h2>
				<p style="margin:0;font-size:14px;color:#6b7280">${escapeHtml(intro)}</p>
				${sections.map(renderSection).join("")}
			</td>
		</tr>
	</table>
</body>
</html>`
}

/** Reads stored photo files as attachments, files that cannot be read are skipped */
export async function readAttachments(
	fileNames: string[]
): Promise<EmailAttachment[]> {
	const attachments: EmailAttachment[] = []

	for (const fileName of fileNames) {
		try {
			const safeName = path.basename(fileName)

			attachments.push({
				filename: safeName,
				content: await readFile(path.join(uploadsRoot, safeName))
			})
		} catch (error) {
			console.error(`Could not attach ${fileName}`, error)
		}
	}

	return attachments
}

/**
 * Sends an email to the admin (ADMIN_EMAIL). It never throws, because a failing email must not
 * break an upload or the dav webhook. Does nothing if RESEND_API_KEY or ADMIN_EMAIL are not set.
 */
export async function sendAdminEmail(params: {
	subject: string
	html: string
	attachments?: EmailAttachment[]
	idempotencyKey?: string
}) {
	const to = process.env.ADMIN_EMAIL
	const apiKey = process.env.RESEND_API_KEY

	if (!to || !apiKey) {
		console.warn(
			`Email "${params.subject}" not sent, RESEND_API_KEY or ADMIN_EMAIL is not set`
		)
		return
	}

	try {
		resend ??= new Resend(apiKey)

		const response = await resend.emails.send(
			{
				from: process.env.EMAIL_FROM || "no-reply@dav-apps.tech",
				to,
				subject: params.subject,
				html: params.html,
				attachments: params.attachments
			},
			params.idempotencyKey
				? { idempotencyKey: params.idempotencyKey }
				: undefined
		)

		if (response.error || !response.data) {
			console.error(`Email "${params.subject}" failed`, response.error)
		}
	} catch (error) {
		console.error(`Email "${params.subject}" failed`, error)
	}
}

const formatPrice = (cents: number) =>
	`${(cents / 100).toFixed(2)} €`.replace(".", ",")

type Address = {
	name: string
	email?: string | null
	phone?: string | null
	line1: string
	line2?: string | null
	postalCode: string
	city: string
	state?: string | null
	country: string
}

function addressRows(address: Address): Rows {
	return [
		["Name", address.name],
		["Email", address.email],
		["Phone", address.phone],
		["Address", address.line1],
		["", address.line2],
		["City", `${address.postalCode} ${address.city}`],
		["State", address.state],
		["Country", address.country]
	]
}

export async function sendToyOrderEmail(params: {
	orderUuid: string
	toy: { uuid: string; title: string }
	price: number
	/** The shipping address of the customer */
	address: Address
	/** The address of the seller from their profile, if they entered one */
	sellerAddress?: Address | null
	/** The file names of the photos of the toy */
	photoFileNames: string[]
}) {
	const attachments = await readAttachments(params.photoFileNames)
	const sections: Section[] = [
		{
			rows: [
				["Toy", params.toy.title],
				["Price", formatPrice(params.price)],
				["Order", params.orderUuid],
				["Toy UUID", params.toy.uuid],
				["Photos", `${attachments.length} attached`]
			]
		},
		{ heading: "Customer (shipping address)", rows: addressRows(params.address) }
	]

	if (params.sellerAddress) {
		sections.push({
			heading: "Seller",
			rows: addressRows(params.sellerAddress)
		})
	}

	await sendAdminEmail({
		subject: `New order received - ${params.toy.title}`,
		html: renderEmail("New toy order", "A toy was just bought.", sections),
		attachments,
		idempotencyKey: `order/${params.orderUuid}`
	})
}

export async function sendDrawingOrderEmail(params: {
	orderUuid: string
	drawingUuid: string
	fileName: string
	price: number
	address: Address
}) {
	await sendAdminEmail({
		subject: "New order received - Drawing",
		html: renderEmail("New drawing order", "A drawing was just paid.", [
			{
				rows: [
					["Price", formatPrice(params.price)],
					["Order", params.orderUuid],
					["Drawing UUID", params.drawingUuid],
					["Drawing", "attached"]
				]
			},
			{
				heading: "Customer (shipping address)",
				rows: addressRows(params.address)
			}
		]),
		attachments: await readAttachments([params.fileName]),
		idempotencyKey: `order/${params.orderUuid}`
	})
}

export async function sendDrawingUploadedEmail(params: {
	drawingUuid: string
	userId: bigint
	attachment: EmailAttachment
}) {
	await sendAdminEmail({
		subject: "New drawing uploaded",
		html: renderEmail(
			"New drawing uploaded",
			"A drawing was uploaded, it has not been paid yet.",
			[
				{
					rows: [
						["Drawing UUID", params.drawingUuid],
						["User ID", params.userId.toString()],
						["Drawing", "attached"]
					]
				}
			]
		),
		attachments: [params.attachment],
		idempotencyKey: `drawing/${params.drawingUuid}`
	})
}
