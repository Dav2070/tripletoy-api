# tripletoy-api

GraphQL API für den Marktplatz für gebrauchte Spielzeuge (Apollo Server, Express, Prisma/PostgreSQL, Redis, dav-js).

## Setup

```bash
cp .env.example .env   # Werte eintragen
npm install
npx prisma db push     # Schema in die Datenbank übertragen
npm run dev
```

## Beispielquery

```graphql
query {
	listToys(limit: 10) {
		total
		items {
			uuid
			title
			price
		}
	}
}
```
