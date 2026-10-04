/** Parses a date like 2016-05-24, returns null if it is not a valid calendar date */
export function parseDate(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
	if (match == null) return null

	const [year, month, day] = match.slice(1).map(Number)
	const date = new Date(Date.UTC(year, month - 1, day))

	if (
		date.getUTCFullYear() != year ||
		date.getUTCMonth() != month - 1 ||
		date.getUTCDate() != day
	)
		return null

	return date
}

/** Calculates the age in full years at the given day */
export function calculateAge(birthDate: Date, now: Date = new Date()): number {
	let age = now.getUTCFullYear() - birthDate.getUTCFullYear()
	const month = now.getUTCMonth() - birthDate.getUTCMonth()

	if (month < 0 || (month == 0 && now.getUTCDate() < birthDate.getUTCDate())) {
		age--
	}

	return age
}
