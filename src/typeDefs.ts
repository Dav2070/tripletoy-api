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
		listToyLocations: [ToyLocation!]!
		listMyToys(limit: Int, offset: Int): ToyList! @auth
		listMyPurchases(limit: Int, offset: Int): ToyList! @auth
		retrieveMyToyStats: ToyStats! @auth
		retrieveMyProfile: Profile! @auth
	}

	type Mutation {
		createToy(
			title: String!
			description: String
			price: Int!
			address: AddressInput
		): Toy!
			@auth
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
		deleteToy(uuid: String!): Boolean! @auth
		createToyCheckoutSession(
			uuid: String!
			successUrl: String!
			cancelUrl: String!
		): CheckoutSession! @auth
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
	}

	type Toy {
		uuid: String!
		title: String!
		description: String
		price: Int!
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
		createdAt: String!
		updatedAt: String!
	}

	type ToyOrder {
		name: String!
		email: String!
		phone: String
		line1: String!
		line2: String
		postalCode: String!
		city: String!
		state: String
		country: String!
		createdAt: String!
	}

	type CheckoutSession {
		url: String!
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
		"Collected coins: 15 for every purchase and 10 for every sale"
		coins: Int!
	}

	type ToyList {
		total: Int!
		items: [Toy!]!
	}
`
