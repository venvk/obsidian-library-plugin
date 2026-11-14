import { requestUrl } from 'obsidian'
import { dmyOf } from '../util'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'

// Certificates and badges added by the link to their public page, no key: a Credly badge reads its Open
// Badges record, an Anthropic Academy (Skilljar) certificate its verify page, any other page its own
// Open Badges link or share tags. The Source ID is the page's URL.

export const CERTIFICATE_SOURCE = 'certificates'

const CREDLY_BADGE = /^https:\/\/(?:www\.)?credly\.com\/badges\/([0-9a-f-]{36})/i
const SKILLJAR = /^https:\/\/verify\.skilljar\.com\/c\/[a-z0-9]+/i

export interface Certificate {
	name: string
	issuer: string
	issued: string
	expires: string
	image: string
	skills: string[]
	description: string
	url: string
}

async function getText(url: string): Promise<string> {
	try {
		const resp = await requestUrl({ url, throw: false })
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

export async function readCertificate(url: string): Promise<Certificate | null> {
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
				Expires: found.expires || null,
				Genre: found.skills,
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
