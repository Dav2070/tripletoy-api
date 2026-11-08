export const admins = [1]
export const toyTitleMaxLength = 100
export const toyDescriptionMaxLength = 5000
export const profileAgeMax = 120
export const profileDescriptionMaxLength = 1000
export const profileAddressFieldMaxLength = 100
// Digits, spaces and the usual separators, e.g. +49 170 1234567 or (030) 123-456
export const profilePhoneRegex = /^[0-9+()\/.\- ]{3,30}$/
// Stripe requires at least 0.50 €, dav allows at most 1000 € per order
export const toyPriceMin = 50
export const toyPriceMax = 100_000
// Sold toys stay visible in the public list for this long after the sale
export const soldToyVisibleDays = 7
// Coins for every completed order, the balance is calculated from the orders
export const coinsPerPurchase = 15
export const coinsPerSale = 10
// Maximum number of toys on the map
export const toyLocationsMax = 500
export const toyPhotoMaxCount = 10
export const toyPhotoMaxBytes = 10 * 1024 * 1024
// The id of the dav user that owns the fixed products. They are shown separately from
// the other toys and are not part of the normal toy list.
export const fixedProductsUserId = process.env.FIXED_PRODUCTS_USER_ID
	? BigInt(process.env.FIXED_PRODUCTS_USER_ID)
	: null
// Maximum number of drawings per user
export const drawingMaxCount = 20
// Price of turning a drawing into a toy in cents
export const drawingPrice = 4999
export const drawingMaxBytes = 10 * 1024 * 1024
export const uploadsDir = process.env.UPLOADS_DIR || "uploads"

// The id of the Toy table of the app in the dav dashboard
export const toyTableId = Number(process.env.DAV_TOY_TABLE_ID)
// The table of the dav dashboard for the drawings, the table of the toys if not set
export const drawingTableId = Number(process.env.DAV_DRAWING_TABLE_ID) || toyTableId
// Public base url of this API, used for the product images in the checkout
export const publicUrl = (
	process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4002}`
).replace(/\/$/, "")
