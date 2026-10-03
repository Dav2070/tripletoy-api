export const typeDefs = `#graphql
	directive @auth(role: String) on FIELD_DEFINITION

	type Query {
		retrieveToy(uuid: String!): Toy
		listToys(
			limit: Int
			offset: Int
		): ToyList!
	}

	type Toy {
		uuid: String!
		title: String!
		description: String
		price: Int!
		createdAt: String!
		updatedAt: String!
	}

	type ToyList {
		total: Int!
		items: [Toy!]!
	}
`
