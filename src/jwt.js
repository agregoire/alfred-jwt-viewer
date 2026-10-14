ObjC.import("Foundation");

// Standard claim names, shown in item subtitles.
const CLAIM_NAMES = {
	alg: "Algorithm",
	typ: "Type",
	kid: "Key ID",
	cty: "Content type",
	enc: "Encryption",
	iss: "Issuer",
	sub: "Subject",
	aud: "Audience",
	exp: "Expires",
	nbf: "Not before",
	iat: "Issued at",
	jti: "JWT ID",
	auth_time: "Authenticated at",
	updated_at: "Updated at",
	azp: "Authorized party",
	scope: "Scope",
	sid: "Session ID",
	nonce: "Nonce",
};

// Numbers in this range are treated as Unix timestamps in seconds (2000-01-01 to 2100-01-01).
const MIN_TIMESTAMP = 946684800;
const MAX_TIMESTAMP = 4102444800;

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
	weekday: "short",
	year: "numeric",
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	second: "2-digit",
	timeZoneName: "short",
});

/**
 * Finds the first thing that looks like a JWT in the input, so pasting
 * "Bearer eyJ..." or a quoted token still works.
 * @param {string} input
 * @returns {string|null}
 */
function extractToken(input) {
	const match = input.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*){1,3}/);
	return match ? match[0] : null;
}

/**
 * Decodes a base64url string to UTF-8 text.
 * @param {string} segment
 * @returns {string}
 */
function base64UrlDecode(segment) {
	let base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
	while (base64.length % 4 !== 0) base64 += "=";
	const data = $.NSData.alloc.initWithBase64EncodedStringOptions(base64, 0);
	if (data.isNil()) throw new Error("Invalid base64");
	const text = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
	if (text.isNil()) throw new Error("Not UTF-8 text");
	return ObjC.unwrap(text);
}

/**
 * @param {string} segment
 * @returns {object}
 */
function decodeSegment(segment) {
	const value = JSON.parse(base64UrlDecode(segment));
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Not a JSON object");
	return value;
}

/**
 * @param {*} value
 * @returns {boolean}
 */
function isTimestamp(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= MIN_TIMESTAMP && value < MAX_TIMESTAMP;
}

/**
 * Describes how far a date is from now, like "in 3 hours" or "2 days ago".
 * @param {Date} date
 * @returns {string}
 */
function relativeTime(date) {
	const seconds = Math.round((date.getTime() - Date.now()) / 1000);
	const units = [
		["year", 365 * 24 * 3600],
		["month", 30 * 24 * 3600],
		["day", 24 * 3600],
		["hour", 3600],
		["minute", 60],
		["second", 1],
	];
	const [unit, size] = units.find(([, size]) => Math.abs(seconds) >= size) || ["second", 1];
	const amount = Math.round(seconds / size);
	return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(amount, unit);
}

/**
 * Flattens nested objects into dotted keys so each value gets its own row.
 * Arrays stay whole and are shown as JSON.
 * @param {object} object
 * @param {string} prefix
 * @returns {Array<[string, *]>}
 */
function flatten(object, prefix = "") {
	return Object.entries(object).flatMap(([key, value]) => {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0) {
			return flatten(value, path);
		}
		return [[path, value]];
	});
}

/**
 * Builds the Alfred item for one claim.
 * @param {string} key
 * @param {*} value
 * @param {string} section
 * @returns {object}
 */
function claimItem(key, value, section) {
	const raw = typeof value === "string" ? value : JSON.stringify(value);
	const label = CLAIM_NAMES[key] ? `${CLAIM_NAMES[key]} · ` : "";

	if (isTimestamp(value)) {
		const date = new Date(value * 1000);
		const readable = DATE_FORMAT.format(date);
		return {
			title: `${key}: ${readable}`,
			subtitle: `${label}${relativeTime(date)} · ${value} · ${section}`,
			arg: readable,
			text: { copy: readable, largetype: `${key}\n${readable}\n${relativeTime(date)}\n${value}` },
			mods: {
				cmd: { arg: raw, subtitle: `Copy raw value: ${raw}` },
				alt: { arg: date.toISOString(), subtitle: `Copy ISO 8601 (UTC): ${date.toISOString()}` },
			},
			valid: true,
		};
	}

	return {
		title: `${key}: ${raw}`,
		subtitle: `${label}${section}`,
		arg: raw,
		text: { copy: raw, largetype: `${key}\n${raw}` },
		valid: true,
	};
}

/**
 * Builds the item that shows a whole decoded section as JSON.
 * @param {string} name
 * @param {object} object
 * @returns {object}
 */
function sectionItem(name, object) {
	const pretty = JSON.stringify(object, null, 2);
	return {
		title: `${name}: ${JSON.stringify(object)}`,
		subtitle: `${name} JSON · ↵ to copy · ⌘L to view`,
		arg: pretty,
		text: { copy: pretty, largetype: pretty },
		valid: true,
	};
}

/**
 * Builds the top item that says whether the token is currently usable.
 * @param {object} payload
 * @returns {object}
 */
function statusItem(payload) {
	const now = Date.now() / 1000;
	const note = "Signature not verified";

	if (isTimestamp(payload.nbf) && payload.nbf > now) {
		const date = new Date(payload.nbf * 1000);
		return { title: `⏳ Not valid yet, starts ${relativeTime(date)}`, subtitle: `${DATE_FORMAT.format(date)} · ${note}`, valid: false };
	}
	if (isTimestamp(payload.exp)) {
		const date = new Date(payload.exp * 1000);
		const title = payload.exp <= now ? `❌ Expired ${relativeTime(date)}` : `✅ Valid, expires ${relativeTime(date)}`;
		return { title, subtitle: `${DATE_FORMAT.format(date)} · ${note}`, valid: false };
	}
	return { title: "✅ No expiry set", subtitle: note, valid: false };
}

/**
 * @param {string} input
 * @returns {Array<object>}
 */
function buildItems(input) {
	const trimmed = input.trim();
	if (!trimmed) {
		return [{ title: "Paste a JWT", subtitle: "jwt eyJhbGciOi...", valid: false }];
	}

	const token = extractToken(trimmed);
	if (!token) {
		return [{ title: "Not a JWT", subtitle: "Expected header.payload.signature", valid: false }];
	}

	const parts = token.split(".");
	let header;
	try {
		header = decodeSegment(parts[0]);
	} catch (error) {
		return [{ title: "Could not decode header", subtitle: String(error.message), valid: false }];
	}

	// A JWE (5 parts) has an encrypted payload, so only the header is readable.
	if (parts.length === 5) {
		return [
			{ title: "🔒 Encrypted token (JWE)", subtitle: "Only the header can be decoded", valid: false },
			sectionItem("Header", header),
			...flatten(header).map(([key, value]) => claimItem(key, value, "Header")),
		];
	}

	let payload;
	try {
		payload = decodeSegment(parts[1]);
	} catch (error) {
		return [
			{ title: "Could not decode payload", subtitle: String(error.message), valid: false },
			sectionItem("Header", header),
		];
	}

	return [
		statusItem(payload),
		sectionItem("Payload", payload),
		sectionItem("Header", header),
		...flatten(payload).map(([key, value]) => claimItem(key, value, "Payload")),
		...flatten(header).map(([key, value]) => claimItem(key, value, "Header")),
	];
}

function run(argv) {
	return JSON.stringify({ items: buildItems(argv[0] || "") });
}
