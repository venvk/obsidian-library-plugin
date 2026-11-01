import { requestUrl } from 'obsidian'
import { NFT_CATEGORY } from './categories'
import { publicHttpsUrl } from './util'
import { readPage } from './watchSites'

// NFTs held by the wallets you list, read from each chain's explorer: Blockscout for
// Ethereum and its L2s, Etherscan (with a key) for BNB and Taiko, tonapi for TON,
// Magic Eden's wallet index for Solana (regular and compressed NFTs alike).

export const NFT_TYPE = NFT_CATEGORY
export const NFT_SOURCE = 'nft'

export type WalletKind = 'evm' | 'solana' | 'ton'

export interface Wallet {
	kind: WalletKind
	address: string
}

// One token, or several tokens of one collection that look the same, with how many are held.
export interface HeldNft {
	// chain:contract:name, the note's Source ID
	key: string
	chain: string
	collection: string
	name: string
	image: string
	url: string
	count: number
	// looks like a phishing drop: amounts, rewards, claim or airdrop calls, links
	spam: boolean
	// an achievement or attendance token (Galxe OAT, POAP, Layer3 CUBE), not a collectible
	oat: boolean
	// the user's wallets that hold it
	wallets?: string[]
	// ERC-721, ERC-1155, TEP-62, Metaplex…
	standard?: string
	// the token id, or the token's own address on TON and Solana
	tokenId?: string
	// the tokenURI read from the chain, and whether name and image came from it just now
	tokenUri?: string
	fresh?: boolean
	// the wallet asked for it: its own transaction brought it, or it came from someone the wallet pays or calls
	trusted?: boolean
	// the token's contract (a TON or Solana collection), and when the token was minted and reached the wallet (ISO)
	contract?: string
	minted?: string
	acquired?: string
}

// What a note already knows of its token, so an import does not ask again.
export interface KnownToken {
	uri?: string
	minted?: string
}

// The chains a read covered: a token missing from one of them has left the wallet.
export interface NftRead {
	held: HeldNft[]
	chains: string[]
}

// Addresses separated by commas, spaces or lines, each kind told by its shape.
export function parseWallets(text: string): Wallet[] {
	const out: Wallet[] = []
	for (const raw of text.split(/[\s,;]+/)) {
		const address = raw.trim()
		if (!address) continue
		let kind: WalletKind | null = null
		if (/^0x[0-9a-fA-F]{40}$/.test(address)) kind = 'evm'
		else if (/^(EQ|UQ|kQ|0Q)[\w-]{46}$/.test(address) || /^-?\d:[0-9a-fA-F]{64}$/.test(address)) kind = 'ton'
		else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) kind = 'solana'
		if (kind && !out.some(w => w.address === address)) out.push({ kind, address })
	}
	return out
}

// ipfs:// and ar:// through public gateways; anything else must be public https.
// ipfs.io and dweb.link time out on most files, so links to them move to Filebase too.
export function mediaUrl(value: unknown): string {
	const raw = typeof value === 'string' ? value.trim() : ''
	// a picture the contract draws itself: kept as data, the import saves it to a file
	if (/^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/i.test(raw) && raw.length < 2000000) return raw
	const ipfs = /^(?:ipfs:\/\/|https:\/\/(?:ipfs\.io|dweb\.link)\/ipfs\/)(?:ipfs\/)?(.+)$/i.exec(raw)?.[1]
	if (ipfs) return publicHttpsUrl(`https://ipfs.filebase.io/ipfs/${ipfs.replace(/^\/+/, '')}`) ?? ''
	const ar = /^ar:\/\/(.+)$/i.exec(raw)?.[1]
	if (ar) return publicHttpsUrl(`https://arweave.net/${ar.replace(/^\/+/, '')}`) ?? ''
	return publicHttpsUrl(raw) ?? ''
}

// Tokens of one collection with the same name and picture are one entry, counted.
export function groupHeld(tokens: HeldNft[]): HeldNft[] {
	const out = new Map<string, HeldNft>()
	for (const token of tokens) {
		const known = out.get(token.key)
		if (known) {
			known.count += token.count
			for (const wallet of token.wallets ?? []) if ((known.wallets ?? []).indexOf(wallet) < 0) known.wallets = [...(known.wallets ?? []), wallet]
		} else out.set(token.key, { ...token })
	}
	return [...out.values()]
}

// Unsolicited drops lure with money and a site to visit; the explorers flag only some of them.
const SPAM = /\$\s?\d|\d\s?k?\s?\$|\d\s?(usdt|usdc|eth|ton|sol)\b|reward|claim|airdrop|voucher|giveaway|\bgift\b|bonus|eligible|visit|free mint|https?:|www\.|t\.me\/|\.(com|io|xyz|net|org|app|site|top|vip|pro|gift|fun|lol|cc|ly|me|gg|to|link|click|live|info)\b/i

export function looksLikeSpam(name: string, collection: string): boolean {
	return SPAM.test(name) || SPAM.test(collection)
}

const OAT = /\b(oat|poap)\b|galxe|galaxy oat|layer3 cube/i

export function isOat(name: string, collection: string): boolean {
	return OAT.test(collection) || OAT.test(name)
}

// chain:contract:token id; a token with an address of its own (TON, Solana) is chain:address
export function nftKey(chain: string, contract: string, id = ''): string {
	return id ? `${chain}:${contract.toLowerCase()}:${id.trim().toLowerCase()}` : `${chain}:${contract.toLowerCase()}`
}

// Blockscout hosts for the EVM chains it indexes.
export const BLOCKSCOUT: Record<string, string> = {
	Ethereum: 'eth.blockscout.com',
	Optimism: 'optimism.blockscout.com',
	Base: 'base.blockscout.com',
	Arbitrum: 'arbitrum.blockscout.com',
	Polygon: 'polygon.blockscout.com',
	Gnosis: 'gnosis.blockscout.com',
	Celo: 'celo.blockscout.com',
	zkSync: 'zksync.blockscout.com',
	Scroll: 'scroll.blockscout.com',
	Ink: 'explorer.inkonchain.com',
	Soneium: 'soneium.blockscout.com',
	Unichain: 'unichain.blockscout.com',
	Mode: 'explorer.mode.network',
	'Arbitrum Nova': 'arbitrum-nova.blockscout.com',
	Shape: 'shapescan.xyz',
	Robinhood: 'robinhoodchain.blockscout.com',
}

interface BlockscoutItem {
	id?: unknown
	token_type?: unknown
	value?: unknown
	image_url?: unknown
	metadata?: { name?: unknown; image?: unknown } | null
	token?: { address_hash?: unknown; name?: unknown; symbol?: unknown; reputation?: unknown } | null
	thumbnails?: Record<string, unknown> | null
	media_url?: unknown
}

export function blockscoutTokens(chain: string, host: string, items: BlockscoutItem[]): HeldNft[] {
	const out: HeldNft[] = []
	for (const item of items) {
		const contract = typeof item.token?.address_hash === 'string' ? item.token.address_hash : ''
		const id = typeof item.id === 'string' ? item.id : ''
		// the explorer's own flag: scam contracts stay out
		if (!contract || item.token?.reputation === 'scam') continue
		// an unnamed contract shows its symbol, where airdrop spam writes "Visit website to claim USDT"
		const symbol = typeof item.token?.symbol === 'string' ? item.token.symbol.trim() : ''
		const collection = typeof item.token?.name === 'string' && item.token.name.trim() ? item.token.name.trim() : symbol || contract
		const name = typeof item.metadata?.name === 'string' && item.metadata.name.trim() ? item.metadata.name.trim() : collection
		out.push({
			key: nftKey(chain, contract, id),
			chain,
			collection,
			name,
			standard: typeof item.token_type === 'string' ? item.token_type : '',
			tokenId: id,
			contract,
			// Blockscout's own cached preview first: IPFS gateways often time out
			image: mediaUrl(item.thumbnails?.['500x500']) || mediaUrl(item.media_url) || mediaUrl(item.image_url) || mediaUrl(item.metadata?.image),
			url: `https://${host}/token/${contract}/instance/${id}`,
			count: Math.max(1, Number(item.value) || 1),
			spam: looksLikeSpam(name, collection) || looksLikeSpam(symbol, ''), oat: isOat(name, collection),
		})
	}
	return out
}

// An explorer page's JSON: straight, or through the sign-in partition's browser when Cloudflare asks for one.
async function explorerJson(url: string): Promise<unknown> {
	try {
		const answer = await requestUrl({ url, headers: { accept: 'application/json' }, throw: false })
		if (answer.status === 200) return answer.json as unknown
	} catch {
		// a challenge page is no JSON: the browser below gets past it
	}
	const text = await readPage(url, 'document.body ? document.body.innerText : ""', 30000, "!!document.body && /^\\s*[[{]/.test(document.body.innerText)")
	try {
		return JSON.parse(text) as unknown
	} catch {
		return null
	}
}

const PUBLIC_RPC: Record<string, string> = {
	Ethereum: 'https://ethereum-rpc.publicnode.com',
	Optimism: 'https://mainnet.optimism.io',
	Base: 'https://mainnet.base.org',
	Arbitrum: 'https://arb1.arbitrum.io/rpc',
	Polygon: 'https://polygon-bor-rpc.publicnode.com',
	Gnosis: 'https://rpc.gnosischain.com',
	Robinhood: 'https://rpc.mainnet.chain.robinhood.com',
}

// What the wallet asked for: the hashes of its own transactions, and everyone it sent one to.
// ponytail: the newest 500 of each; an older purchase from a quiet seller may still read as a stranger's
async function walletTrust(host: string, address: string, withOwn: boolean): Promise<{ own: Set<string>; peers: Set<string>; incoming: Map<string, { tx: string; from: string; time: string }> }> {
	const own = new Set<string>()
	const peers = new Set<string>()
	const incoming = new Map<string, { tx: string; from: string; time: string }>()
	const walk = async (path: string, take: (item: Record<string, unknown>) => void): Promise<void> => {
		let next = ''
		for (let page = 0; page < 10; page++) {
			const data = await explorerJson(`https://${host}/api/v2/addresses/${address}/${path}${next}`) as { items?: Record<string, unknown>[]; next_page_params?: Record<string, unknown> | null } | null
			if (!data || !Array.isArray(data.items)) return
			data.items.forEach(take)
			if (!data.next_page_params) return
			next = '&' + new URLSearchParams(Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)])).toString()
		}
	}
	// the newest transfer in comes first: that is when the wallet got the token
	await walk('token-transfers?type=ERC-721,ERC-1155&filter=to', item => {
		const address = (item.token as { address_hash?: unknown } | null)?.address_hash
		const contract = typeof address === 'string' ? address.toLowerCase() : ''
		const id = (item.total as { token_id?: unknown } | null)?.token_id
		const tx = typeof item.transaction_hash === 'string' ? item.transaction_hash : typeof item.tx_hash === 'string' ? item.tx_hash : ''
		const time = typeof item.timestamp === 'string' ? item.timestamp : ''
		if (contract && typeof id === 'string' && !incoming.has(`${contract}:${id}`)) incoming.set(`${contract}:${id}`, { tx: tx.toLowerCase(), from: hashOf(item.from), time })
	})
	if (withOwn) {
		await walk('transactions?filter=from', item => {
			if (typeof item.hash === 'string') own.add(item.hash.toLowerCase())
			const to = hashOf(item.to)
			if (to) peers.add(to)
		})
	}
	return { own, peers, incoming }
}

function hashOf(value: unknown): string {
	const hash = (value as { hash?: unknown } | null)?.hash
	return typeof hash === 'string' ? hash.toLowerCase() : ''
}

// When a token was minted: its transfer from the zero address, or the oldest one the explorer lists.
async function mintedAt(host: string, contract: string, id: string): Promise<string> {
	const data = await explorerJson(`https://${host}/api/v2/tokens/${contract}/instances/${id}/transfers`) as { items?: Record<string, unknown>[]; next_page_params?: unknown } | null
	const items = data?.items ?? []
	const mint = items.find(item => /^0x0{40}$/i.test(hashOf(item.from))) ?? (data?.next_page_params ? undefined : items[items.length - 1])
	return typeof mint?.timestamp === 'string' ? mint.timestamp : ''
}

async function blockscoutHeld(chain: string, host: string, address: string, known: (key: string) => KnownToken | undefined): Promise<NftRead> {
	const held: HeldNft[] = []
	let next = ''
	for (let page = 0; page < 40; page++) {
		const data = await explorerJson(`https://${host}/api/v2/addresses/${address}/nft?type=ERC-721,ERC-1155${next}`) as { items?: BlockscoutItem[]; next_page_params?: Record<string, unknown> | null } | null
		if (!data || !Array.isArray(data.items)) return { held, chains: [] }
		held.push(...blockscoutTokens(chain, host, data.items))
		if (!data.next_page_params) {
			// a contract nobody verified is how airdrop spam ships: it goes with the spam
			const verified = new Map<string, boolean>()
			for (const token of held) {
				const contract = /\/token\/(0x[0-9a-fA-F]{40})\//.exec(token.url)?.[1] ?? ''
				if (!contract || token.spam) continue
				if (!verified.has(contract)) {
					const info = await explorerJson(`https://${host}/api/v2/addresses/${contract}`) as { is_verified?: unknown } | null
					verified.set(contract, info?.is_verified !== false)
				}
				if (verified.get(contract) === false) token.spam = true
			}
			// a token the wallet asked for is not spam, whatever its name or contract says; the wallet's
			// history is read only on a network where something looks like spam
			const trust = await walletTrust(host, address, held.some(token => token.spam))
			for (const token of held) {
				const contract = (token.contract ?? '').toLowerCase()
				const came = trust.incoming.get(`${contract}:${token.tokenId ?? ''}`)
				if (came?.time) token.acquired = came.time
				if (!token.spam) continue
				token.trusted = trust.peers.has(contract) || (!!came && (trust.own.has(came.tx) || trust.peers.has(came.from)))
				if (token.trusted) token.spam = false
			}
			// the mint date is asked once per token: a note that has it keeps it
			for (const token of held) {
				if (token.spam || !token.contract || !token.tokenId) continue
				const minted = known(token.key)?.minted
				token.minted = minted || await mintedAt(host, token.contract, token.tokenId)
			}
			// the token's own metadata from its tokenURI on the chain: the explorer's copy can predate a reveal.
			// A URI the note already knows is not fetched again; spam is not worth the requests.
			const rpc = PUBLIC_RPC[chain]
			for (const token of held) {
				const where = /\/token\/(0x[0-9a-fA-F]{40})\/instance\/(\d+)$/.exec(token.url)
				if (!rpc || token.spam || !where) continue
				const uri = await tokenUri(rpc, where[1] ?? '', where[2] ?? '')
				if (!uri) continue
				token.tokenUri = uri
				if (known(token.key)?.uri === uri && token.image) continue
				const meta = await tokenMeta(uri)
				if (meta.image) token.image = meta.image
				if (meta.name) token.name = meta.name
				token.fresh = !!(meta.image || meta.name)
			}
			return { held, chains: [chain] }
		}
		next = '&' + new URLSearchParams(Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)])).toString()
	}
	return { held, chains: [] }
}

// BNB and Taiko: the transfers Etherscan lists, replayed into what the wallet holds now.
const ETHERSCAN_CHAINS: Record<string, { id: number; rpc: string; site: string; nftscan?: string }> = {
	BNB: { id: 56, rpc: 'https://bsc-dataseed.binance.org', site: 'bscscan.com', nftscan: 'bnb.nftscan.com' },
	Taiko: { id: 167000, rpc: 'https://rpc.mainnet.taiko.xyz', site: 'taikoscan.io' },
}

interface EtherscanTransfer {
	from?: string
	to?: string
	contractAddress?: string
	tokenID?: string
	tokenName?: string
	tokenValue?: string
}

export function replayTransfers(address: string, transfers: EtherscanTransfer[]): Array<{ contract: string; id: string; collection: string; count: number }> {
	const me = address.toLowerCase()
	const held = new Map<string, { contract: string; id: string; collection: string; count: number }>()
	for (const t of transfers) {
		const contract = (t.contractAddress ?? '').toLowerCase()
		const id = t.tokenID ?? ''
		if (!contract || !id) continue
		const key = `${contract}:${id}`
		const amount = Math.max(1, Number(t.tokenValue) || 1)
		const entry = held.get(key) ?? { contract, id, collection: t.tokenName || contract, count: 0 }
		if ((t.to ?? '').toLowerCase() === me) entry.count += amount
		if ((t.from ?? '').toLowerCase() === me) entry.count -= amount
		held.set(key, entry)
	}
	return [...held.values()].filter(entry => entry.count > 0)
}

// A decimal token id as 64 hex digits, by long division: ids pass 2^53.
export function idHex(id: string): string {
	let digits = id.replace(/^0+/, '') || '0'
	if (!/^\d+$/.test(digits)) return ''
	let hex = ''
	while (digits !== '0') {
		let rest = 0
		let next = ''
		for (const d of digits) {
			const value = rest * 10 + Number(d)
			next += String(Math.floor(value / 16))
			rest = value % 16
		}
		hex = rest.toString(16) + hex
		digits = next.replace(/^0+/, '') || '0'
	}
	return (hex || '0').padStart(64, '0')
}

async function rpcCall(rpc: string, method: string, params: unknown[]): Promise<unknown> {
	const answer = await requestUrl({ url: rpc, method: 'POST', contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), throw: false })
	const json = answer.json as { result?: unknown; error?: unknown }
	if (answer.status !== 200 || json.error !== undefined) throw new Error(`${method} failed`)
	return json.result
}

// An ABI-encoded string returned by eth_call.
function abiString(result: string): string {
	if (result.length <= 130) return ''
	const length = parseInt(result.slice(66, 130), 16)
	const bytes = result.slice(130, 130 + length * 2).match(/../g) ?? []
	try {
		return decodeURIComponent(bytes.map(b => `%${b}`).join(''))
	} catch {
		return ''
	}
}

// tokenURI(uint256), or uri(uint256) for ERC-1155, read from the chain itself.
async function tokenUri(rpc: string, contract: string, id: string): Promise<string> {
	const hex = idHex(id)
	if (!hex) return ''
	for (const selector of ['0xc87b56dd', '0x0e89341c']) {
		try {
			const uri = abiString(String(await rpcCall(rpc, 'eth_call', [{ to: contract, data: selector + hex }, 'latest']))).replace('{id}', hex)
			if (uri) return uri
		} catch {
			// a contract without that method: try the other
		}
	}
	return ''
}

// The token's own name and picture from its metadata: an explorer's copy can be from before a reveal.
async function tokenMeta(uri: string): Promise<{ name: string; image: string }> {
	const metadata = uri ? await tokenMetadata(uri) : null
	return { name: typeof metadata?.name === 'string' ? metadata.name.trim() : '', image: mediaUrl(metadata?.image) }
}

async function tokenImage(rpc: string, contract: string, id: string): Promise<string> {
	return (await tokenMeta(await tokenUri(rpc, contract, id))).image
}

async function tokenMetadata(uri: string): Promise<{ image?: unknown; name?: unknown } | null> {
	const inline = /^data:application\/json(;base64)?,(.*)$/i.exec(uri)
	try {
		if (inline) return JSON.parse(inline[1] ? atob(inline[2] ?? '') : decodeURIComponent(inline[2] ?? '')) as { image?: unknown; name?: unknown }
		const url = mediaUrl(uri)
		if (!url) return null
		const answer = await requestUrl({ url, throw: false })
		return answer.status === 200 ? answer.json as { image?: unknown; name?: unknown } : null
	} catch {
		return null
	}
}

async function etherscanHeld(chain: string, address: string, key: string): Promise<NftRead> {
	const info = ETHERSCAN_CHAINS[chain]
	if (!info) return { held: [], chains: [] }
	const transfers: EtherscanTransfer[] = []
	for (const action of ['tokennfttx', 'token1155tx']) {
		try {
			const answer = await requestUrl({ url: `https://api.etherscan.io/v2/api?chainid=${String(info.id)}&module=account&action=${action}&address=${address}&startblock=0&endblock=999999999&sort=asc&apikey=${encodeURIComponent(key)}`, throw: false })
			const data = answer.json as { message?: string; result?: unknown }
			if (Array.isArray(data.result)) transfers.push(...data.result as EtherscanTransfer[])
			else if (data.message !== 'No transactions found') return { held: [], chains: [] }
		} catch {
			return { held: [], chains: [] }
		}
	}
	const held: HeldNft[] = []
	for (const token of replayTransfers(address, transfers)) {
		held.push({
			key: nftKey(chain, token.contract, token.id),
			tokenId: token.id,
			chain,
			collection: token.collection,
			name: `${token.collection} #${token.id}`,
			image: await tokenImage(info.rpc, token.contract, token.id),
			url: `https://${info.site}/nft/${token.contract}/${token.id}`,
			count: token.count,
			spam: looksLikeSpam(token.collection, token.collection), oat: isOat(token.collection, token.collection),
		})
	}
	return { held, chains: [chain] }
}

// Runs inside the explorer's NFT transfers page: its table, 100 rows a page, every page.
const TRANSFERS_PAGE = "(async () => {\n\tconst sleep = (ms) => new Promise((r) => setTimeout(r, ms))\n\tconst ready = () => window.jQuery && jQuery.fn.dataTable && jQuery.fn.dataTable.isDataTable('#datatable') && document.querySelector('#datatable tbody tr a[href*=\"/nft/\"]')\n\tfor (let i = 0; i < 60 && !ready(); i++) await sleep(500)\n\tif (!ready()) return ''\n\tconst dt = jQuery('#datatable').DataTable()\n\tconst rows = []\n\tconst grab = () => {\n\t\tfor (const tr of document.querySelectorAll('#datatable tbody tr')) {\n\t\t\tconst link = [...tr.querySelectorAll('a[href*=\"/nft/\"]')].pop()\n\t\t\tconst m = link && /\\/nft\\/(0x[0-9a-fA-F]{40})\\/(\\d+)/.exec(link.getAttribute('href') || '')\n\t\t\tif (!m) continue\n\t\t\tconst cells = [...tr.cells].map((c) => c.innerText.replace(/\\s+/g, ' ').trim())\n\t\t\trows.push({ contract: m[1].toLowerCase(), id: m[2], dir: cells.find((t) => /^(IN|OUT|SELF)$/.test(t)) || '', link: link.innerText.trim(), type: cells.find((t) => /-(721|1155)$/.test(t)) || '' })\n\t\t}\n\t}\n\tconst page = (fn) => new Promise((resolve) => { dt.one('draw', () => resolve()); fn(); setTimeout(resolve, 20000) })\n\tawait page(() => dt.page.len(100).draw('page'))\n\tconst pages = dt.page.info().pages\n\tfor (let p = 0; p < pages && p < 40; p++) {\n\t\tif (p > 0) await page(() => dt.page(p).draw('page'))\n\t\tgrab()\n\t}\n\treturn JSON.stringify(pages <= 40 ? rows : null)\n})()"

interface PageTransfer {
	contract?: string
	id?: string
	dir?: string
	link?: string
	type?: string
}

// The transfers page's rows replayed: what came in and did not go out again.
export function pageHeld(chain: string, site: string, rows: PageTransfer[]): Array<HeldNft & { contract: string; id: string }> {
	const net = new Map<string, { contract: string; id: string; count: number; link: string }>()
	const types = new Map<string, string>()
	for (const row of rows) {
		if (!row.contract || !row.id || (row.dir !== 'IN' && row.dir !== 'OUT')) continue
		const key = `${row.contract}:${row.id}`
		if (row.type) types.set(key, row.type)
		const entry = net.get(key) ?? { contract: row.contract, id: row.id, count: 0, link: row.link ?? '' }
		entry.count += row.dir === 'IN' ? 1 : -1
		net.set(key, entry)
	}
	const out: Array<HeldNft & { contract: string; id: string }> = []
	for (const { contract, id, count, link } of net.values()) {
		if (count <= 0) continue
		// the explorer's "NFT:" label is not part of the name
		const [first = '', second = ''] = link.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code))).split('\n').map(line => line.trim().replace(/^NFT:\s*/, ''))
		const collection = second || first || contract
		const name = first && first.indexOf(id) >= 0 ? first : `${first || collection} #${id}`
		out.push({ key: nftKey(chain, contract, id), chain, collection, name, image: '', url: `https://${site}/nft/${contract}/${id}`, count, spam: looksLikeSpam(name, collection), oat: isOat(name, collection), contract, id, tokenId: id, standard: types.get(`${contract}:${id}`) ?? '' })
	}
	return out
}

// Runs on an NFTScan token page: the token's picture once the page has drawn it.
const NFTSCAN_PAGE = "(async () => {\n\tconst sleep = (ms) => new Promise((r) => setTimeout(r, ms))\n\tconst pick = () => [...document.querySelectorAll('img')].map((i) => i.currentSrc || i.src).find((s) => /^https:/.test(s) && s !== location.href && !s.startsWith(location.origin + '/0x') && !/\\/static\\/|loading|logo|avatar|icon|\\.svg/i.test(s))\n\tfor (let i = 0; i < 30; i++) { const src = pick(); if (src) return src; await sleep(500) }\n\treturn ''\n})()"

// NFTScan keeps copies of pictures whose own servers are gone (Galxe, SecondLive); its page is read like a visitor's.
async function nftscanImage(host: string, contract: string, id: string): Promise<string> {
	try {
		return publicHttpsUrl(await readPage(`https://${host}/${contract}/${id}`, NFTSCAN_PAGE, 30000)) ?? ''
	} catch {
		return ''
	}
}

// BscScan and TaikoScan show a cached preview on the token's page.
async function explorerImage(page: string): Promise<string> {
	try {
		const answer = await requestUrl({ url: page, throw: false })
		const found = answer.status === 200 ? /https:\/\/cdn\d*\.assetquay\.com\/file\/nftimagebucket\/[^"'\s)<]+/.exec(answer.text)?.[0] : undefined
		return found ? publicHttpsUrl(found) ?? '' : ''
	} catch {
		return ''
	}
}

// Without a key: the explorer's own transfers page, read in the sign-in browser. Pictures come from
// tokenURI, a few dozen per import: tokens that already have one are skipped, the rest follow on later imports.
async function pageScanHeld(chain: string, address: string, hasCover: (key: string) => boolean): Promise<NftRead> {
	const info = ETHERSCAN_CHAINS[chain]
	if (!info) return { held: [], chains: [] }
	let rows: PageTransfer[] | null = null
	try {
		rows = JSON.parse(await readPage(`https://${info.site}/nft-transfers?a=${address}`, TRANSFERS_PAGE, 90000) || 'null') as PageTransfer[] | null
	} catch {
		rows = null
	}
	if (!Array.isArray(rows)) return { held: [], chains: [] }
	const held = pageHeld(chain, info.site, rows)
	// a collection whose metadata server is gone (Galxe, SecondLive) skips tokenURI after its first miss, so the
	// budget reaches every collection; NFTScan, which kept copies of their pictures, is asked per token
	let budget = 60
	const misses = new Map<string, number>()
	for (const token of held.sort((a, b) => Number(a.spam || a.oat) - Number(b.spam || b.oat))) {
		if (budget <= 0) break
		if (token.spam || hasCover(token.key)) continue
		budget--
		// the explorer keeps its own copy of some pictures, even when the token's server is gone
		token.image = await explorerImage(token.url)
		if (!token.image && !misses.has(token.contract)) {
			token.image = await tokenImage(info.rpc, token.contract, token.id)
			if (!token.image) misses.set(token.contract, 1)
		}
		if (!token.image && info.nftscan) token.image = await nftscanImage(info.nftscan, token.contract, token.id)
	}
	return { held, chains: [chain] }
}

interface TonItem {
	address?: unknown
	trust?: unknown
	metadata?: { name?: unknown; image?: unknown } | null
	collection?: { address?: unknown; name?: unknown } | null
	previews?: Array<{ resolution?: unknown; url?: unknown }> | null
}

export function tonTokens(items: TonItem[]): HeldNft[] {
	const out: HeldNft[] = []
	for (const item of items) {
		const address = typeof item.address === 'string' ? item.address : ''
		if (!address || item.trust === 'blacklist') continue
		const collection = typeof item.collection?.name === 'string' && item.collection.name.trim() ? item.collection.name.trim() : 'TON'
		const name = typeof item.metadata?.name === 'string' && item.metadata.name.trim() ? item.metadata.name.trim() : collection
		const preview = (item.previews ?? []).find(p => p.resolution === '500x500')?.url
		out.push({ key: nftKey('TON', address), chain: 'TON', collection, name, contract: typeof item.collection?.address === 'string' ? item.collection.address : '', image: mediaUrl(preview) || mediaUrl(item.metadata?.image), url: `https://tonviewer.com/${address}`, count: 1, spam: looksLikeSpam(name, collection), oat: isOat(name, collection), standard: 'TEP-62', tokenId: address })
	}
	return out
}

// One TON key has a wallet per version (v3, v4, v5), each its own address. A wallet that has sent anything
// shows its key, and the key lists the other versions; those in use are read too.
async function tonWallets(address: string): Promise<string[]> {
	try {
		const key = (await requestUrl({ url: `https://tonapi.io/v2/accounts/${address}/publickey`, throw: false })).json as { public_key?: unknown }
		if (typeof key.public_key !== 'string' || !/^[0-9a-f]{64}$/i.test(key.public_key)) return [address]
		const list = (await requestUrl({ url: `https://tonapi.io/v2/pubkeys/${key.public_key}/wallets`, throw: false })).json as { accounts?: Array<{ address?: unknown; status?: unknown }> }
		const used = (list.accounts ?? []).filter(a => typeof a.address === 'string' && a.status === 'active').map(a => a.address as string)
		return [address, ...used]
	} catch {
		return [address]
	}
}

async function tonAllHeld(address: string): Promise<NftRead> {
	const held: HeldNft[] = []
	const seen = new Set<string>()
	for (const wallet of await tonWallets(address)) {
		const read = await tonHeld(wallet)
		if (read.chains.length === 0) return { held, chains: [] }
		// the same wallet in two spellings (friendly and raw) lists the same tokens
		for (const token of read.held) if (!seen.has(token.url)) {
			seen.add(token.url)
			held.push(token)
		}
	}
	return { held, chains: ['TON'] }
}

async function tonHeld(address: string): Promise<NftRead> {
	const held: HeldNft[] = []
	for (let offset = 0; offset < 10000; offset += 1000) {
		try {
			const answer = await requestUrl({ url: `https://tonapi.io/v2/accounts/${address}/nfts?limit=1000&offset=${String(offset)}&indirect_ownership=false`, throw: false })
			const items = (answer.json as { nft_items?: TonItem[] }).nft_items
			if (answer.status !== 200 || !Array.isArray(items)) return { held, chains: [] }
			held.push(...tonTokens(items))
			if (items.length < 1000) break
		} catch {
			return { held, chains: [] }
		}
	}
	return { held, chains: ['TON'] }
}

interface SolanaItem {
	mintAddress?: unknown
	isCompressed?: unknown
	isProgrammable?: unknown
	tokenStandard?: unknown
	name?: unknown
	image?: unknown
	collection?: unknown
	collectionName?: unknown
}

export function solanaTokens(items: SolanaItem[]): HeldNft[] {
	const out: HeldNft[] = []
	for (const item of items) {
		const mint = typeof item.mintAddress === 'string' ? item.mintAddress : ''
		if (!mint) continue
		const collection = typeof item.collectionName === 'string' && item.collectionName.trim() ? item.collectionName.trim() : 'Solana'
		const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : collection
		// Metaplex: compressed (Bubblegum), programmable, Core, or the classic token metadata standard
		const standard = item.isCompressed === true ? 'Metaplex cNFT' : item.isProgrammable === true || item.tokenStandard === 4 ? 'Metaplex pNFT' : typeof item.tokenStandard === 'string' && /core/i.test(item.tokenStandard) ? 'Metaplex Core' : 'Metaplex'
		out.push({ key: nftKey('Solana', mint), chain: 'Solana', collection, name, contract: typeof item.collection === 'string' ? item.collection : '', image: mediaUrl(item.image), url: `https://solscan.io/token/${mint}`, count: 1, spam: looksLikeSpam(name, collection), oat: isOat(name, collection), standard, tokenId: mint })
	}
	return out
}

async function solanaHeld(address: string): Promise<NftRead> {
	const held: HeldNft[] = []
	for (let offset = 0; offset < 5000; offset += 500) {
		try {
			const answer = await requestUrl({ url: `https://api-mainnet.magiceden.dev/v2/wallets/${address}/tokens?offset=${String(offset)}&limit=500`, throw: false })
			const items = answer.json as unknown
			if (answer.status !== 200 || !Array.isArray(items)) return { held, chains: [] }
			held.push(...solanaTokens(items as SolanaItem[]))
			if (items.length < 500) break
		} catch {
			return { held, chains: [] }
		}
	}
	return { held, chains: ['Solana'] }
}

// The networks a wallet list can name; "EVM" stands for every EVM network at once.
export const EVM_NETWORKS = ['Ethereum', 'Optimism', 'Base', 'Arbitrum', 'Polygon', 'BNB', 'Taiko', 'Gnosis', 'Celo', 'zkSync', 'Scroll', 'Ink', 'Soneium', 'Unichain', 'Mode', 'Arbitrum Nova', 'Shape', 'Robinhood']
export const WALLET_FIELDS = ['EVM', 'TON', 'Solana']

export interface WalletPair {
	chain: string
	address: string
}

// The "EVM" field's addresses on every EVM network, TON and Solana on their own.
export function walletPairs(fields: Record<string, string>): WalletPair[] {
	const out: WalletPair[] = []
	const add = (chain: string, text: string | undefined, kind: WalletKind): void => {
		for (const wallet of parseWallets(text ?? '')) {
			if (wallet.kind === kind && !out.some(p => p.chain === chain && p.address.toLowerCase() === wallet.address.toLowerCase())) out.push({ chain, address: wallet.address })
		}
	}
	for (const chain of EVM_NETWORKS) {
		add(chain, fields.EVM, 'evm')
	}
	add('TON', fields.TON, 'ton')
	add('Solana', fields.Solana, 'solana')
	return out
}

// Every wallet's tokens, grouped. A network counts as read only when all its wallets read in full:
// only then may a token missing from it be taken as gone. BNB and Taiko need the Etherscan key.
export async function nftHoldings(pairs: WalletPair[], etherscanKey: string, hasCover: (key: string) => boolean = () => false, known: (key: string) => KnownToken | undefined = () => undefined): Promise<NftRead> {
	const held: HeldNft[] = []
	const done = new Map<string, number>()
	const wanted = new Map<string, number>()
	for (const { chain, address } of pairs) {
		const host = BLOCKSCOUT[chain]
		let read: NftRead | null = null
		if (host) read = await blockscoutHeld(chain, host, address, known)
		else if (ETHERSCAN_CHAINS[chain]) read = etherscanKey ? await etherscanHeld(chain, address, etherscanKey) : await pageScanHeld(chain, address, hasCover)
		else if (chain === 'TON') read = await tonAllHeld(address)
		else if (chain === 'Solana') read = await solanaHeld(address)
		if (!read) continue
		wanted.set(chain, (wanted.get(chain) ?? 0) + 1)
		for (const token of read.held) token.wallets = [address]
		held.push(...read.held)
		for (const c of read.chains) done.set(c, (done.get(c) ?? 0) + 1)
	}
	const chains = [...wanted.keys()].filter(chain => done.get(chain) === wanted.get(chain))
	return { held: groupHeld(held), chains }
}
