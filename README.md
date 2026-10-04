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

## Eigene Spielzeuge

Erfordert den `Authorization`-Header. Liefert nur die Spielzeuge des angemeldeten Users.

```graphql
query {
	listMyToys(limit: 24) {
		total
		items {
			uuid
			title
		}
	}
}
```

## Profil

Alter, Beschreibung, Telefonnummer und Adresse sind optional (Alter 1–120, Beschreibung höchstens 1000 Zeichen, jedes Adressfeld höchstens 100 Zeichen). Die Adresse ist nur über `retrieveMyProfile` für den Nutzer selbst abrufbar. Beim Speichern ersetzen die übergebenen Werte die bisherigen, ohne Wert wird das Feld geleert.

```graphql
mutation {
	updateMyProfile(
		age: 8
		description: "Sammelt Lego"
		phone: "+49 170 1234567"
		address: {
			name: "Max Mustermann"
			line1: "Musterweg 1"
			postalCode: "10115"
			city: "Berlin"
			country: "Deutschland"
		}
	) {
		age
		description
	}
}

query {
	retrieveMyProfile {
		age
		description
		phone
		address {
			name
			line1
			line2
			postalCode
			city
			country
		}
	}
}
```

Verkaufte Spielzeuge erscheinen noch sieben Tage nach dem Verkauf in `listToys` (hinter den unverkauften), danach nicht mehr. Der Verkäufer sieht sie weiter in `listMyToys` (mit `sold: true`), der Käufer in `listMyPurchases`. Über die UUID bleiben sie abrufbar, `Toy.bought` zeigt dem Käufer, dass er das Spielzeug gekauft hat.

```graphql
query {
	listMyPurchases(limit: 24) {
		total
		items {
			uuid
			title
		}
	}
}
```

## Spielzeug einstellen

Erfordert den `Authorization`-Header mit dem dav-Access-Token. Der Preis wird in Cent angegeben (50 bis 100.000, also 0,50 € bis 1.000 €). Beim Erstellen wird zusätzlich ein dav-TableObject mit derselben UUID angelegt.

```graphql
mutation {
	createToy(title: "Lego Feuerwehr", description: "Vollständig", price: 1500) {
		uuid
		title
	}
}
```

## Spielzeug bearbeiten und löschen

Nur der Besitzer darf sein Spielzeug ändern oder löschen, und nur solange es nicht verkauft ist (sonst `TOY_ALREADY_SOLD`). Beim Löschen werden auch die Fotos und das dav-TableObject entfernt.

```graphql
mutation {
	updateToy(uuid: "<uuid>", title: "Lego Feuerwehr", description: "Neu", price: 1800) {
		uuid
	}
	deleteToy(uuid: "<uuid>")
}
```

## Fotos hochladen

Fotos werden vorerst lokal im Verzeichnis `uploads/` gespeichert (`UPLOADS_DIR`, nicht im Git). Nur der Besitzer des Spielzeugs darf Fotos hinzufügen (max. 10 Stück, je max. 10 MB, JPEG/PNG/WebP). Der Body ist das rohe Bild, der `Content-Type` der Bildtyp:

```bash
curl -X POST http://localhost:3005/toys/<uuid>/photos \
  -H "Authorization: <access token>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @foto.jpg
```

Ein Foto entfernst du mit `DELETE /toys/<uuid>/photos/<foto-uuid>` (ebenfalls mit `Authorization`-Header). Die Antwort des Uploads enthält `uuid` und `url` (z.B. `/photos/<datei>.jpg`). Über GraphQL sind die Fotos als `photos { uuid url }` am `Toy` abrufbar.

## Spielzeug kaufen

Bezahlt wird mit dem dav-Checkout (Stripe), wie in PocketLib. Voraussetzungen in `.env`:

- `DAV_TOY_TABLE_ID`: Id der Tabelle „Toy“ der App im dav-Dashboard (muss dort angelegt werden)
- `DAV_WEBHOOK_KEY`: derselbe Wert wie `WEBHOOK_KEY` in dav-api
- `PUBLIC_URL`: öffentliche URL dieser API (Produktbild im Checkout)

Im dav-Dashboard muss die Webhook-URL der App auf `<API-URL>/davWebhook` zeigen.

```graphql
mutation {
	createToyCheckoutSession(
		uuid: "<toy uuid>"
		successUrl: "http://localhost:3006/toy/<uuid>?purchase=success"
		cancelUrl: "http://localhost:3006/toy/<uuid>"
	) {
		url
	}
}
```

Ablauf: Die Mutation liefert die Stripe-URL, auf die der Käufer weitergeleitet wird (Lieferadresse wird im Checkout abgefragt). Nach der Zahlung ruft dav `POST /davWebhook` mit `order.completed` auf. Das Backend lädt die Bestellung bei dav, speichert sie mit der Lieferadresse als `ToyOrder` und markiert das Spielzeug als verkauft (`sold`). Der Verkäufer sieht die Bestellung über `Toy.order`. Die Auszahlung an den Verkäufer erfolgt nicht über die App.

Bezahlen zwei Käufer gleichzeitig dasselbe Spielzeug, gewinnt die zuerst gemeldete Bestellung. Für die zweite steht ein Hinweis im Log, sie muss manuell erstattet werden.
