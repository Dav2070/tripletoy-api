export const typeDefs = `#graphql
	directive @auth(role: String) on FIELD_DEFINITION

	type Query {
		retrieveToy(uuid: String!): Toy
		listToys(
			limit: Int
			offset: Int
		): ToyList!
		listMyToys(limit: Int, offset: Int): ToyList! @auth
		retrieveMyProfile: Profile! @auth
	}

	type Mutation {
		createToy(title: String!, description: String, price: Int!): Toy!
			@auth
		updateMyProfile(age: Int, description: String): Profile! @auth
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

	type Profile {
		age: Int
		description: String
	}

	type Toy {
		uuid: String!
		title: String!
		description: String
		price: Int!
		photos: [ToyPhoto!]!
		sold: Boolean!
		"Whether the logged in user is the seller"
		mine: Boolean!
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

	type ToyList {
		total: Int!
		items: [Toy!]!
	}
`
