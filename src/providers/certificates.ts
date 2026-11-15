import { requestUrl } from 'obsidian'
import { dmyOf } from '../util'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'

// Certificates and badges added by the link to their public page, no key: a Credly badge reads its Open
// Badges record, a Claude Academy badge the academy's public check, an Anthropic Academy (Skilljar)
// certificate its verify page, any other page its own Open Badges link or share tags. The Source ID is the page's URL.

export const CERTIFICATE_SOURCE = 'certificates'

const CREDLY_BADGE = /^https:\/\/(?:www\.)?credly\.com\/badges\/([0-9a-f-]{36})/i
const SKILLJAR = /^https:\/\/verify\.skilljar\.com\/c\/[a-z0-9]+/i
// Exceed LMS, where Google for Education (Gemini Academy) and others issue theirs
const EXCEED = /^https:\/\/[a-z0-9-]+\.exceedlms\.com\/student\/award\/([A-Za-z0-9]+)/i
const ACADEMY = /^https:\/\/academy\.claude\.com\/verify\/([^/?#]+)/i
const ACADEMY_VERIFY = 'https://academy.claude.com/api/anthropic.academy_public.api.v1alpha.AcademyPublicService/VerifyCertificate'

export interface Certificate {
	name: string
	// where it was earned, when that has a mark of its own on the card (Claude Academy)
	platform?: string
	issuer: string
	issued: string
	expires: string
	image: string
	skills: string[]
	description: string
	url: string
}

async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
	try {
		const resp = await requestUrl({ url, throw: false, headers })
		return resp.status === 200 ? resp.text : ''
	} catch {
		return ''
	}
}

async function getJson<T>(url: string): Promise<T | null> {
	try {
		const resp = await requestUrl({ url, throw: false, headers: { Accept: 'application/json' } })
		return resp.status === 200 ? (resp.json as T) : null
	} catch {
		return null
	}
}

const decode = (text: string): string => text
	.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
	.replace(/\s+/g, ' ').trim()

function meta(html: string, name: string): string {
	const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i').exec(html)?.[0] ?? ''
	return decode(/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? '')
}

// "May 6, 2026" or an ISO date, as the note's dd.mm.yyyy
function dateOf(text: string): string {
	const time = Date.parse(text)
	return text && !Number.isNaN(time) ? dmyOf(new Date(time).toISOString()) : ''
}

interface ObAssertion { badge?: string | ObBadge; issuedOn?: string; expires?: string }
interface ObBadge { name?: string; description?: string; image?: string | { id?: string }; tags?: string[]; issuer?: string | { name?: string } }

// An Open Badges 2.0 assertion: the badge it awards and who issued it are links of their own
async function openBadge(assertionUrl: string, pageUrl: string): Promise<Certificate | null> {
	const assertion = await getJson<ObAssertion>(assertionUrl)
	if (!assertion?.badge) return null
	const badge = typeof assertion.badge === 'string' ? await getJson<ObBadge>(assertion.badge) : assertion.badge
	if (!badge?.name) return null
	const issuer = typeof badge.issuer === 'string' ? await getJson<{ name?: string }>(badge.issuer) : badge.issuer
	return {
		name: badge.name,
		issuer: issuer?.name ?? '',
		issued: dateOf(assertion.issuedOn ?? ''),
		expires: dateOf(assertion.expires ?? ''),
		image: typeof badge.image === 'string' ? badge.image : badge.image?.id ?? '',
		skills: badge.tags ?? [],
		description: badge.description ?? '',
		url: pageUrl,
	}
}

// The verify page lists its facts as label, then value
function skilljar(html: string, url: string): Certificate | null {
	const lines = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').split(/<[^>]+>/).map(decode).filter(Boolean)
	const after = (label: string): string => {
		const i = lines.indexOf(label)
		return i >= 0 ? lines[i + 1] ?? '' : ''
	}
	const name = after('Course Completed') || meta(html, 'og:title').replace(/^Certificate for /, '')
	if (!name) return null
	return {
		name,
		issuer: after('Offered By'),
		issued: dateOf(after('Completion Date')),
		expires: dateOf(after('Expiration Date')),
		image: meta(html, 'og:image'),
		skills: [],
		description: '',
		url,
	}
}

// The academy's own check of a badge's code: an unknown code answers an empty object
async function academyBadge(code: string, url: string): Promise<Certificate | null> {
	try {
		const resp = await requestUrl({ url: ACADEMY_VERIFY, method: 'POST', throw: false, contentType: 'application/json', headers: { 'Connect-Protocol-Version': '1' }, body: JSON.stringify({ verifyCode: decodeURIComponent(code) }) })
		const found = resp.status === 200 ? resp.json as { valid?: boolean; certificateName?: string; courseTitle?: string; issuedAt?: string } : null
		const name = found?.valid ? found.courseTitle || found.certificateName : ''
		if (!name) return null
		return { name, platform: 'Claude Academy', issuer: 'Claude Academy', issued: dateOf(found?.issuedAt ?? ''), expires: '', image: '', skills: [], description: '', url }
	} catch {
		return null
	}
}

// Claude Academy's verify code, Credly's badge id, Skilljar's certificate code
export function credentialId(url: string): string {
	const m = /^https:\/\/(?:academy\.claude\.com\/verify|(?:www\.)?credly\.com\/badges|verify\.skilljar\.com\/c|[a-z0-9-]+\.exceedlms\.com\/student\/award)\/([^/?#]+)/i.exec(url)
	if (!m) return ''
	// a stray % in a pasted link would throw: the code is kept as written then
	try {
		return decodeURIComponent(m[1] ?? '')
	} catch {
		return m[1] ?? ''
	}
}

// The award page draws the certificate as an SVG: the activity's name heads the page, the issue and expiry
// dates are its texts, the program its title
function exceed(html: string, url: string): Certificate | null {
	const name = decode((/<h1[^>]*>\s*<a[^>]*>([^<]+)<\/a>/i.exec(html)?.[1] ?? '').trim())
	if (!name) return null
	const program = decode(/<svg[\s\S]*?<title>([^<]+)<\/title>/i.exec(html)?.[1] ?? '')
	const site = decode(/<title>([^<]+)<\/title>/i.exec(html.replace(/<svg[\s\S]*?<\/svg>/gi, ''))?.[1] ?? '')
	const dates: string[] = []
	for (const m of html.match(/<tspan[^>]*>\s*\d{2}\/\d{2}\/\d{4}\s*<\/tspan>/g) ?? []) {
		const [mm, dd, yyyy] = (/\d{2}\/\d{2}\/\d{4}/.exec(m)?.[0] ?? '').split('/')
		const dmy = `${dd ?? ''}.${mm ?? ''}.${yyyy ?? ''}`
		if (dates.indexOf(dmy) < 0) dates.push(dmy)
	}
	const ymd = (dmy: string): string => dmy.split('.').reverse().join('')
	dates.sort((a, b) => ymd(a).localeCompare(ymd(b)))
	return {
		name,
		platform: /google/i.test(site) ? 'Google' : undefined,
		issuer: program || site,
		issued: dates[0] ?? '',
		expires: dates.length > 1 ? dates[dates.length - 1] ?? '' : '',
		image: '',
		skills: [],
		description: '',
		url,
	}
}

// A certificate the page draws rather than links: the element to photograph for the note's picture
export function drawnCertificate(url: string): string | null {
	return EXCEED.test(url) ? '.award__customsvg svg' : null
}

export async function readCertificate(url: string): Promise<Certificate | null> {
	const academy = ACADEMY.exec(url)
	if (academy) return academyBadge(academy[1] ?? '', url)
	if (EXCEED.test(url)) {
		// in English the dates come as MM/DD/YYYY; another language writes them its own way
		const html = await getText(url, { 'Accept-Language': 'en-US,en;q=0.9' })
		return html ? exceed(html, url) : null
	}
	const credly = CREDLY_BADGE.exec(url)
	if (credly) return openBadge(`https://www.credly.com/api/v1/obi/v2/badge_assertions/${credly[1] ?? ''}`, url)
	const html = await getText(url)
	if (!html) return null
	if (SKILLJAR.test(url)) return skilljar(html, url)
	// an issuer that publishes Open Badges links the assertion from the page
	const assertion = /<link[^>]+type=["']application\/ld\+json["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1]
		?? /<link[^>]+href=["']([^"']+)["'][^>]*type=["']application\/ld\+json["']/i.exec(html)?.[1]
	if (assertion?.startsWith('https://')) {
		const found = await openBadge(decode(assertion), url)
		if (found) return found
	}
	// share tags alone: only a page that says it is a certificate, else every pasted link would be one
	if (!/certificat|credential|badge|verif|accomplishment/i.test(url)) return null
	const name = meta(html, 'og:title') || decode(/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '')
	if (!name) return null
	return { name, issuer: meta(html, 'og:site_name'), issued: '', expires: '', image: meta(html, 'og:image'), skills: [], description: meta(html, 'og:description'), url }
}

export class CertificateProvider implements ContentProvider {
	readonly id = CERTIFICATE_SOURCE
	readonly contentTypes: ContentType[] = ['certificate']

	// only a link answers: there is no catalogue of certificates to search by name
	async search(query: string): Promise<SearchResult[]> {
		const url = query.trim()
		if (!/^https:\/\/\S+$/i.test(url)) return []
		const found = await readCertificate(url)
		if (!found) return []
		return [{ provider: this.id, sourceId: url, title: found.name, year: Number(found.issued.slice(-4)) || null, cover: found.image || null, subtitle: found.issuer || null, raw: found }]
	}

	async fetch(sourceId: string, _type: ContentType, raw?: unknown): Promise<NormalizedMetadata | null> {
		const found = (raw as Certificate | undefined)?.url === sourceId ? raw as Certificate : await readCertificate(sourceId)
		if (!found) return null
		return {
			fields: {
				Name: found.name,
				Creator: found.issuer ? [found.issuer] : [],
				Year: Number(found.issued.slice(-4)) || null,
				Issued: found.issued || null,
				// the code the issuer's own check takes: the last part of the link
				'Credential ID': credentialId(found.url) || null,
				Expires: found.expires || null,
				Genre: found.skills,
				Platforms: found.platform ? [found.platform] : null,
				Cover: found.image || null,
				URL: found.url,
				Description: found.description || null,
				// the issuer's own words, not a Wikipedia article about the name
				'Description Local': !!found.description,
			},
			progressTotal: null,
			imdbId: null,
		}
	}
}
