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
export function mediaUrl(value: unknown): string {
	const raw = typeof value === 'string' ? value.trim() : ''
	const ipfs = /^ipfs:\/\/(?:ipfs\/)?(.+)$/i.exec(raw)?.[1]
	if (ipfs) return `https://ipfs.io/ipfs/${ipfs}`
	const ar = /^ar:\/\/(.+)$/i.exec(raw)?.[1]
	if (ar) return `https://arweave.net/${ar}`
	return publicHttpsUrl(raw) ?? ''
}

// Tokens of one collection with the same name and picture are one entry, counted.
export function groupHeld(tokens: HeldNft[]): HeldNft[] {
	const out = new Map<string, HeldNft>()
	for (const token of tokens) {
		const known = out.get(token.key)
		if (known) known.count += token.count
		else out.set(token.key, { ...token })
	}
	return [...out.values()]
}

// Unsolicited drops lure with money and a site to visit; the explorers flag only some of them.
const SPAM = /\$\s?\d|\d\s?(usdt|usdc|eth|ton|sol)\b|reward|claim|airdrop|voucher|giveaway|bonus|eligible|visit|free mint|https?:|www\.|t\.me\/|\.(com|io|xyz|net|org|app|site|top|vip|pro|gift|fun|lol|cc)\b/i

export function looksLikeSpam(name: string, collection: string): boolean {
	return SPAM.test(name) || SPAM.test(collection)
}

const OAT = /\b(oat|poap)\b|galxe|galaxy oat|layer3 cube/i

export function isOat(name: string, collection: string): boolean {
	return OAT.test(collection) || OAT.test(name)
}

export function nftKey(chain: string, contract: string, name: string): string {
	return `${chain}:${contract.toLowerCase()}:${name.trim().toLowerCase()}`
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
}

interface BlockscoutItem {
	id?: unknown
	value?: unknown
	image_url?: unknown
	metadata?: { name?: unknown; image?: unknown } | null
	token?: { address_hash?: unknown; name?: unknown; reputation?: unknown } | null
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
		const collection = typeof item.token?.name === 'string' && item.token.name.trim() ? item.token.name.trim() : contract
		const name = typeof item.metadata?.name === 'string' && item.metadata.name.trim() ? item.metadata.name.trim() : collection
		out.push({
			key: nftKey(chain, contract, name),
			chain,
			collection,
			name,
			// Blockscout's own cached preview first: IPFS gateways often time out
			image: mediaUrl(item.thumbnails?.['500x500']) || mediaUrl(item.media_url) || mediaUrl(item.image_url) || mediaUrl(item.metadata?.image),
			url: `https://${host}/token/${contract}/instance/${id}`,
			count: Math.max(1, Number(item.value) || 1),
			spam: looksLikeSpam(name, collection), oat: isOat(name, collection),
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

async function blockscoutHeld(chain: string, host: string, address: string): Promise<NftRead> {
	const held: HeldNft[] = []
	let next = ''
	for (let page = 0; page < 40; page++) {
		const data = await explorerJson(`https://${host}/api/v2/addresses/${address}/nft?type=ERC-721,ERC-1155${next}`) as { items?: BlockscoutItem[]; next_page_params?: Record<string, unknown> | null } | null
		if (!data || !Array.isArray(data.items)) return { held, chains: [] }
		held.push(...blockscoutTokens(chain, host, data.items))
		if (!data.next_page_params) return { held, chains: [chain] }
		next = '&' + new URLSearchParams(Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)])).toString()
	}
	return { held, chains: [] }
}

// BNB and Taiko: the transfers Etherscan lists, replayed into what the wallet holds now.
const ETHERSCAN_CHAINS: Record<string, { id: number; rpc: string; site: string }> = {
	BNB: { id: 56, rpc: 'https://bsc-dataseed.binance.org', site: 'bscscan.com' },
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

// tokenURI(uint256), or uri(uint256) for ERC-1155, read from the chain itself.
async function tokenImage(rpc: string, contract: string, id: string): Promise<string> {
	const hex = idHex(id)
	if (!hex) return ''
	for (const selector of ['0xc87b56dd', '0x0e89341c']) {
		try {
			const answer = await requestUrl({ url: rpc, method: 'POST', contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contract, data: selector + hex }, 'latest'] }), throw: false })
			const result = (answer.json as { result?: string }).result ?? ''
			if (result.length <= 130) continue
			const length = parseInt(result.slice(66, 130), 16)
			const bytes = result.slice(130, 130 + length * 2).match(/../g) ?? []
			const uri = decodeURIComponent(bytes.map(b => `%${b}`).join('')).replace('{id}', hex)
			const metadata = await tokenMetadata(uri)
			if (metadata) return mediaUrl(metadata.image)
		} catch {
			// a contract without that method: try the other
		}
	}
	return ''
}

async function tokenMetadata(uri: string): Promise<{ image?: unknown } | null> {
	const inline = /^data:application\/json(;base64)?,(.*)$/i.exec(uri)
	try {
		if (inline) return JSON.parse(inline[1] ? atob(inline[2] ?? '') : decodeURIComponent(inline[2] ?? '')) as { image?: unknown }
		const url = mediaUrl(uri)
		if (!url) return null
		const answer = await requestUrl({ url, throw: false })
		return answer.status === 200 ? answer.json as { image?: unknown } : null
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
			key: nftKey(chain, token.contract, token.collection),
			chain,
			collection: token.collection,
			name: token.collection,
			image: await tokenImage(info.rpc, token.contract, token.id),
			url: `https://${info.site}/nft/${token.contract}/${token.id}`,
			count: token.count,
			spam: looksLikeSpam(token.collection, token.collection), oat: isOat(token.collection, token.collection),
		})
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
		const contract = typeof item.collection?.address === 'string' ? item.collection.address : address
		const collection = typeof item.collection?.name === 'string' && item.collection.name.trim() ? item.collection.name.trim() : 'TON'
		const name = typeof item.metadata?.name === 'string' && item.metadata.name.trim() ? item.metadata.name.trim() : collection
		const preview = (item.previews ?? []).find(p => p.resolution === '500x500')?.url
		out.push({ key: nftKey('TON', contract, name), chain: 'TON', collection, name, image: mediaUrl(preview) || mediaUrl(item.metadata?.image), url: `https://tonviewer.com/${address}`, count: 1, spam: looksLikeSpam(name, collection), oat: isOat(name, collection) })
	}
	return out
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
		const contract = typeof item.collection === 'string' && item.collection ? item.collection : mint
		const collection = typeof item.collectionName === 'string' && item.collectionName.trim() ? item.collectionName.trim() : 'Solana'
		const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : collection
		out.push({ key: nftKey('Solana', contract, name), chain: 'Solana', collection, name, image: mediaUrl(item.image), url: `https://solscan.io/token/${mint}`, count: 1, spam: looksLikeSpam(name, collection), oat: isOat(name, collection) })
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
export const EVM_NETWORKS = ['Ethereum', 'Optimism', 'Base', 'Arbitrum', 'Polygon', 'BNB', 'Taiko', 'Gnosis', 'Celo', 'zkSync', 'Scroll', 'Ink', 'Soneium', 'Unichain', 'Mode', 'Arbitrum Nova', 'Shape']
export const WALLET_FIELDS = ['EVM', ...EVM_NETWORKS, 'TON', 'Solana']

export interface WalletPair {
	chain: string
	address: string
}

// Per network, the addresses its own field lists, plus for EVM networks those of the "EVM" field.
export function walletPairs(fields: Record<string, string>): WalletPair[] {
	const out: WalletPair[] = []
	const add = (chain: string, text: string | undefined, kind: WalletKind): void => {
		for (const wallet of parseWallets(text ?? '')) {
			if (wallet.kind === kind && !out.some(p => p.chain === chain && p.address.toLowerCase() === wallet.address.toLowerCase())) out.push({ chain, address: wallet.address })
		}
	}
	for (const chain of EVM_NETWORKS) {
		add(chain, fields.EVM, 'evm')
		add(chain, fields[chain], 'evm')
	}
	add('TON', fields.TON, 'ton')
	add('Solana', fields.Solana, 'solana')
	return out
}

// Every wallet's tokens, grouped. A network counts as read only when all its wallets read in full:
// only then may a token missing from it be taken as gone. BNB and Taiko need the Etherscan key.
export async function nftHoldings(pairs: WalletPair[], etherscanKey: string): Promise<NftRead> {
	const held: HeldNft[] = []
	const done = new Map<string, number>()
	const wanted = new Map<string, number>()
	for (const { chain, address } of pairs) {
		const host = BLOCKSCOUT[chain]
		let read: NftRead | null = null
		if (host) read = await blockscoutHeld(chain, host, address)
		else if (ETHERSCAN_CHAINS[chain]) read = etherscanKey ? await etherscanHeld(chain, address, etherscanKey) : null
		else if (chain === 'TON') read = await tonHeld(address)
		else if (chain === 'Solana') read = await solanaHeld(address)
		if (!read) continue
		wanted.set(chain, (wanted.get(chain) ?? 0) + 1)
		held.push(...read.held)
		for (const c of read.chains) done.set(c, (done.get(c) ?? 0) + 1)
	}
	const chains = [...wanted.keys()].filter(chain => done.get(chain) === wanted.get(chain))
	return { held: groupHeld(held), chains }
}
