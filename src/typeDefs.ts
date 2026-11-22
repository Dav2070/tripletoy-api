export const typeDefs = `#graphql
	directive @auth(role: String) on FIELD_DEFINITION

	type Query {
		retrieveToy(uuid: String!): Toy
		listToys(
			limit: Int
			offset: Int
			"Sorts the toys by the distance to this position, sold toys come last"
			latitude: Float
			longitude: Float
		): ToyList!
		"The fixed products, which are always shown separately from the other toys"
		listFixedToys: [Toy!]!
		"The handmade jewelry for kids, which is shown on its own page"
		listJewelry: [Toy!]!
		"The products made from drawings, which are shown on the drawing page"
		listDrawingToys: [Toy!]!
		"The upcoming events within the radius in kilometers (default 50) around the position, the next ones first"
		listEvents(latitude: Float!, longitude: Float!, radius: Float): [Event!]!
		"All events including the past ones, only for admins"
		listAllEvents: [Event!]! @auth(role: "ADMIN")
		listToyLocations: [ToyLocation!]!
		listMyToys(limit: Int, offset: Int): ToyList! @auth
		listMyPurchases(limit: Int, offset: Int): ToyList! @auth
		listMyDrawings(limit: Int, offset: Int): DrawingList! @auth
		retrieveMyToyStats: ToyStats! @auth
		retrieveMyProfile: Profile! @auth
		"The chats of the logged in user, the chat with the latest message first"
		listMyChats: [Chat!]! @auth
		retrieveChat(uuid: String!): Chat @auth
		"The messages of a chat, the oldest first. With before the older messages are returned, with after the newer ones"
		listChatMessages(
			chatUuid: String!
			limit: Int
			"The uuid of a message, only the messages before it are returned"
			before: String
			"The uuid of a message, only the messages after it are returned"
			after: String
		): ChatMessageList! @auth
		"The number of chats with messages the logged in user has not read yet"
		retrieveMyUnreadChatsCount: Int! @auth
	}

	type Mutation {
		createToy(
			title: String!
			description: String
			price: Int!
			address: AddressInput
			"Only admins can choose another category than NORMAL"
			category: ToyCategory
		): Toy!
			@auth
		sendChatMessage(chatUuid: String!, text: String!): ChatMessage! @auth
		"Saves that the logged in user has read all messages of the chat"
		markChatAsRead(chatUuid: String!): Chat! @auth
		updateMyProfile(
			birthDate: String
			description: String
			address: AddressInput
			phone: String
		): Profile! @auth
		updateToy(
			uuid: String!
			title: String!
			description: String
			price: Int!
		): Toy! @auth
		"Changes the category of any toy, only for admins"
		updateToyCategory(uuid: String!, category: ToyCategory!): Toy!
			@auth(role: "ADMIN")
		deleteToy(uuid: String!): Boolean! @auth
		createEvent(input: EventInput!): Event! @auth(role: "ADMIN")
		updateEvent(uuid: String!, input: EventInput!): Event!
			@auth(role: "ADMIN")
		deleteEvent(uuid: String!): Boolean! @auth(role: "ADMIN")
		createDrawingCheckoutSession(
			uuid: String!
			productName: String
			successUrl: String!
			cancelUrl: String!
		): CheckoutSession! @auth
		createToyCheckoutSession(
			uuid: String!
			successUrl: String!
			cancelUrl: String!
		): CheckoutSession! @auth
	}

	input EventInput {
		title: String!
		description: String
		"Start as ISO 8601 date and time"
		startsAt: String!
		"End as ISO 8601 date and time"
		endsAt: String
		"Name of the place"
		venue: String
		line1: String!
		postalCode: String!
		city: String!
		country: String!
		url: String
	}

	"An event in the real world for kids"
	type Event {
		uuid: String!
		title: String!
		description: String
		startsAt: String!
		endsAt: String
		venue: String
		line1: String!
		postalCode: String!
		city: String!
		country: String!
		url: String
		"Distance in kilometers to the position of the request, only set in listEvents"
		distance: Float
		createdAt: String!
		updatedAt: String!
	}

	input AddressInput {
		name: String
		line1: String
		line2: String
		postalCode: String
		city: String
		country: String
	}

	type Address {
		name: String
		line1: String
		line2: String
		postalCode: String
		city: String
		country: String
	}

	type Profile {
		"The age in years, calculated from the birth date"
		age: Int
		"The birth date as YYYY-MM-DD"
		birthDate: String
		"The address of the user, only visible for the user themselves"
		address: Address
		"The phone number of the user, only visible for the user themselves"
		phone: String
		description: String
		"Whether the user is an admin and can manage the events and the categories of the toys"
		isAdmin: Boolean!
	}

	"Decides where a toy is shown"
	enum ToyCategory {
		"A toy of a user, shown in the normal toy lists and on the map"
		NORMAL
		"Our own products, shown separately above the toy lists"
		PRODUCT
		"Handmade jewelry for kids, shown on the jewelry page"
		JEWELRY
		"Products made from drawings, shown on the drawing page"
		DRAWING
	}

	type Toy {
		uuid: String!
		title: String!
		description: String
		price: Int!
		category: ToyCategory!
		photos: [ToyPhoto!]!
		sold: Boolean!
		"Distance in kilometers to the approximate position of the seller, only set when the list is sorted by distance"
		distance: Float
		"Whether the logged in user is the seller"
		mine: Boolean!
		"Whether the logged in user has bought the toy"
		bought: Boolean!
		"The order of the toy, only visible for the seller"
		order: ToyOrder
		"Whether the toy is handed over in person (toys of normal users), otherwise it is shipped"
		handover: Boolean!
		"The uuid of the chat between the seller and the buyer, only for them and the sold toys of normal users"
		chatUuid: String
		createdAt: String!
		updatedAt: String!
	}

	"The order of a toy, there is no address if the toy is handed over in person (toys of normal users)"
	type ToyOrder {
		name: String
		email: String
		phone: String
		line1: String
		line2: String
		postalCode: String
		city: String
		state: String
		country: String
		createdAt: String!
	}

	"A chat between two users who bought toys from each other"
	type Chat {
		uuid: String!
		"The other user of the chat"
		partner: ChatPartner!
		"The toys the users bought from each other, the latest first"
		toys: [Toy!]!
		lastMessage: ChatMessage
		"The number of messages of the partner the logged in user has not read yet"
		unreadCount: Int!
		createdAt: String!
	}

	type ChatPartner {
		firstName: String!
		profileImage: String
	}

	type ChatMessage {
		uuid: String!
		text: String!
		"Whether the logged in user has sent the message"
		mine: Boolean!
		createdAt: String!
	}

	type ChatMessageList {
		"Whether there are older messages than the returned ones"
		hasMore: Boolean!
		items: [ChatMessage!]!
	}

	type CheckoutSession {
		url: String!
	}

	enum DrawingStatus {
		"Created, but not paid yet"
		PENDING_PAYMENT
		RECEIVED
		IN_PROGRESS
		COMPLETED
		REJECTED
	}

	"The drawing of a child that is turned into a real toy"
	type Drawing {
		uuid: String!
		url: String!
		status: DrawingStatus!
		createdAt: String!
		updatedAt: String!
	}

	type DrawingList {
		total: Int!
		items: [Drawing!]!
	}

	type ToyPhoto {
		uuid: String!
		url: String!
	}

	"A toy for sale at the approximate position of its seller"
	type ToyLocation {
		uuid: String!
		title: String!
		price: Int!
		latitude: Float!
		longitude: Float!
		photo: ToyPhoto
	}

	type ToyStats {
		"Toys of the user that are still for sale"
		active: Int!
		"Toys of the user that have been sold"
		sold: Int!
		"Toys the user has bought"
		bought: Int!
		"Collected coins: 15 for every purchase, 10 for every sale and 100 for every paid drawing"
		coins: Int!
	}

	type ToyList {
		total: Int!
		items: [Toy!]!
	}
`
