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

Geburtsdatum, Beschreibung, Telefonnummer und Adresse sind optional (Geburtsdatum `YYYY-MM-DD`, nicht in der Zukunft und höchstens 120 Jahre her, das Alter wird daraus berechnet; Beschreibung höchstens 1000 Zeichen, jedes Adressfeld höchstens 100 Zeichen). Die Adresse ist nur über `retrieveMyProfile` für den Nutzer selbst abrufbar. Beim Speichern ersetzen die übergebenen Werte die bisherigen, ohne Wert wird das Feld geleert.

```graphql
mutation {
	updateMyProfile(
		birthDate: "2016-05-24"
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
		birthDate
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

## Übersicht

`retrieveMyToyStats` (mit Login) zählt die aktiven und verkauften Spielzeuge des Nutzers sowie seine Käufe und die gesammelten Coins.

Coins gibt es für jede bezahlte Bestellung: 15 für den Käufer, 10 für den Verkäufer und 100 für jede bezahlte Zeichnung (`coinsPerPurchase`, `coinsPerSale` und `coinsPerDrawing` in `src/constants.ts`). Der Stand wird aus den gespeicherten Bestellungen berechnet, es gibt keine eigene Tabelle. Ändert man die Werte, ändern sich die Stände rückwirkend.

```graphql
query {
	retrieveMyToyStats {
		active
		sold
		bought
		coins
	}
}
```

## Karte

`listToyLocations` liefert die ungefähre Position der Spielzeuge, die zum Verkauf stehen (höchstens 500). Die Position kommt aus der Adresse des Verkäufers: Beim Speichern der Adresse wird nur **Postleitzahl, Ort und Land** (nicht die Straße) an den Geocoder geschickt (`GEOCODER_URL`, standardmäßig OpenStreetMap Nominatim, `GEOCODER_USER_AGENT` sollte einen Kontakt enthalten). Die Koordinaten werden auf zwei Nachkommastellen (ca. 1 km) gerundet im Profil gespeichert. Spielzeuge von Verkäufern ohne Position erscheinen nicht auf der Karte, und wenn der Geocoder nicht erreichbar ist, wird die Adresse trotzdem gespeichert.

```graphql
query {
	listToyLocations {
		uuid
		title
		price
		latitude
		longitude
	}
}
```

## Nach Entfernung sortieren

`listToys` kann mit `latitude` und `longitude` aufgerufen werden. Dann sind die Spielzeuge nach der Luftlinie zur ungefähren Position des Verkäufers sortiert (Spielzeuge ohne Position und verkaufte kommen zuletzt), und `Toy.distance` enthält die Entfernung in Kilometern. Der Standort wird nur für die Abfrage verwendet und nicht gespeichert, und das Ergebnis wird nicht gecacht.

```graphql
query {
	listToys(limit: 24, latitude: 52.52, longitude: 13.4) {
		items {
			title
			distance
		}
	}
}
```

## Spielzeug einstellen

Erfordert den `Authorization`-Header mit dem dav-Access-Token. Der Preis wird in Cent angegeben (50 bis 100.000, also 0,50 € bis 1.000 €). Beim Erstellen wird zusätzlich ein dav-TableObject mit derselben UUID angelegt. Zum Verkaufen braucht der Nutzer eine vollständige Adresse im Profil (Name, Straße, PLZ, Ort und Land). Hat er noch keine, muss `address` mitgeschickt werden und wird im Profil gespeichert, sonst kommt `ADDRESS_REQUIRED`.

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

## Zeichnungen

Angemeldete Nutzer können Kinderzeichnungen hochladen, aus denen ein echtes Spielzeug entsteht (max. 20 Stück, je max. 10 MB, JPEG/PNG/WebP). Der Upload funktioniert wie bei den Fotos, nur an `POST /drawings` (mit `Authorization`-Header und dem rohen Bild als Body). Die Antwort enthält `uuid`, `url`, `status`, `createdAt` und `updatedAt`.

Eine Zeichnung kostet 49,99 € (`drawingPrice`). Sie startet mit dem Status `PENDING_PAYMENT`, und beim Upload wird dafür ein TableObject in dav angelegt (Tabelle `DAV_DRAWING_TABLE_ID`, ohne Angabe die Toy-Tabelle). Bezahlt wird mit dem dav-Checkout: `createDrawingCheckoutSession(uuid, productName, successUrl, cancelUrl)` liefert die Stripe-URL. Nach der Zahlung setzt der `davWebhook` den Status auf `RECEIVED` und speichert die Bestellung samt Lieferadresse in `DrawingOrder`.

`listMyDrawings(limit, offset)` (mit Login) liefert die eigenen Zeichnungen, die neuesten zuerst, mit dem Status `PENDING_PAYMENT`, `RECEIVED`, `IN_PROGRESS`, `COMPLETED` oder `REJECTED`. Den Status ändert vorerst nur ein Admin direkt in der Datenbank (Tabelle `Drawing`).

## Spielzeug kaufen

Bezahlt wird mit dem dav-Checkout (Stripe), wie in PocketLib. Voraussetzungen in `.env`:

- `DAV_TOY_TABLE_ID`: Id der Tabelle „Toy“ der App im dav-Dashboard (muss dort angelegt werden)
- `FIXED_PRODUCTS_USER_ID` (optional): Id des dav-Nutzers, dem die Festprodukte gehören. Seine Spielzeuge fehlen in `listToys` und stehen stattdessen in `listFixedToys` (alle, auch verkaufte)
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

## E-Mail-Benachrichtigungen

Bei jeder bezahlten Bestellung (Spielzeug oder Zeichnung, `davWebhook`) und bei jeder hochgeladenen Zeichnung (mit dem Bild im Anhang) geht eine E-Mail über [Resend](https://resend.com) an `ADMIN_EMAIL`. Dafür müssen `RESEND_API_KEY` und `ADMIN_EMAIL` in `.env` gesetzt sein, optional `EMAIL_FROM`. Fehler beim Versand werden nur geloggt und lassen Upload bzw. Webhook nicht fehlschlagen.
