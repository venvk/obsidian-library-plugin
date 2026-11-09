import { requestUrl } from 'obsidian'
import { NFT_CATEGORY } from './categories'
import { dmyOf, parseDate, publicHttpsUrl, sleep, within } from './util'
import { readPage } from './watchSites'

// NFTs held by the wallets you list, read from each chain's explorer: Blockscout for
// Ethereum and its L2s, Etherscan (with a key) for BNB and Taiko, tonapi for TON,
// Magic Eden's wallet index for Solana (regular and compressed NFTs alike).

export const NFT_TYPE = NFT_CATEGORY
export const NFT_SOURCE = 'nft'

export type WalletKind = 'evm' | 'solana' | 'ton' | 'near' | 'tezos'

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
	unverified?: boolean
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
	tx?: NftTx
	// in one of OpenSea's shared contracts: the collection is the creator's, not the contract's
	storefront?: boolean
}

export interface NftTx {
	hash?: string
	from?: string
	to?: string
	blockNumber?: string
	// TON and NEAR name a block by more than its number
	blockUrl?: string
	timeStamp?: string
	tokenId?: string
}

export interface HeldContract {
	key: string
	chain: string
	contract: string
	collection: string
	name: string
	count: number
	tokenIds: string[]
	tokens: HeldNft[]
	image: string
	gallery: string[]
	url: string
	standard?: string
	spam: boolean
	unverified?: boolean
	oat: boolean
	wallets: string[]
	history: NftTx[]
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
		else if (/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) kind = 'tezos'
		else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) kind = 'solana'
		else if (/^[a-z0-9_.-]+\.(near|tg)$/i.test(address) || /^[0-9a-fA-F]{64}$/.test(address)) kind = 'near'
		if (kind && !out.some(w => w.address.toLowerCase() === address.toLowerCase())) out.push({ kind, address })
	}
	return out
}

export const IPFS_GATEWAYS = [
	'https://ipfs2.seadn.io/ipfs/',
	'https://ipfs.filebase.io/ipfs/',
	'https://gateway.pinata.cloud/ipfs/',
	'https://cloudflare-ipfs.com/ipfs/',
	'https://ipfs.io/ipfs/',
	'https://dweb.link/ipfs/',
]

// ipfs:// and ar:// through public gateways; anything else must be public https.
// ipfs.io and dweb.link time out on most files, so links to them move to Filebase/SeaDN too.
export function isInvalidNftMedia(url: string): boolean {
	if (!url) return true
	const lower = url.toLowerCase()
	if (lower.indexOf('aa39f9c14ff6244ac5c46382132dff64') >= 0) return true
	if (lower.indexOf('81f4057a5bc31febc57dbff2e0c8967c') >= 0) return true
	if (lower.indexOf('463b14bfcbb174be589d50b226dabf9d') >= 0) return true
	if (lower.indexOf('5ca21603cb9c204b8bc1d9d4ab9c8cb2') >= 0) return true
	if (lower.indexOf('invalidated') >= 0) return true
	if (lower.indexOf('storage.nfte.ai') >= 0) return true
	if (lower.indexOf('nft-placeholder') >= 0) return true
	if (lower.indexOf('1a09c26b1c30427b26944c47fc7bb9') >= 0) return true
	if (lower.indexOf('d81a09c26b1c30427b26944c47fc7bb9') >= 0) return true
	// projects whose image hosts are gone: their tokens' pictures are looked up again (OpenSea keeps copies)
	if (DEAD_MEDIA_HOSTS.some(host => lower.indexOf(`//${host}/`) >= 0)) return true
	return false
}

const DEAD_MEDIA_HOSTS = ['cdn.secondlive.world', 'api.quest3.xyz']

export function mediaUrl(value: unknown): string {
	const raw = typeof value === 'string' ? value.trim() : ''
	if (!raw || isInvalidNftMedia(raw)) return ''
	// on-chain raw SVG: wrap as data URI
	if (/^<svg[\s>]/i.test(raw)) return `data:image/svg+xml;utf8,${encodeURIComponent(raw)}`
	// a picture the contract draws itself: kept as data, the import saves it to a file
	if (/^data:(image\/(png|jpeg|gif|webp|svg\+xml)|application\/json)[;,]/i.test(raw) && raw.length < 2000000) return raw
	const ipfsSub = /^https?:\/\/([a-zA-Z0-9]+)\.ipfs\.(?:nftstorage\.link|dweb\.link|w3s\.link|cf-ipfs\.com)\/?(.*)$/i.exec(raw)
	if (ipfsSub) {
		const cid = ipfsSub[1]
		const subpath = ipfsSub[2] ? `/${ipfsSub[2].replace(/^\/+/, '')}` : ''
		const res = publicHttpsUrl(`https://ipfs.filebase.io/ipfs/${cid}${subpath}`) ?? ''
		return isInvalidNftMedia(res) ? '' : res
	}
	const ipfs = /^(?:ipfs:\/\/|https?:\/\/(?:[^/]+\/)?ipfs\/)(?:ipfs\/)?(.+)$/i.exec(raw)?.[1]
	if (ipfs) {
		const res = publicHttpsUrl(`https://ipfs.filebase.io/ipfs/${ipfs.replace(/^\/+/, '')}`) ?? ''
		return isInvalidNftMedia(res) ? '' : res
	}
	const ar = /^(?:ar:\/\/|https?:\/\/(?:arweave\.net|arweave\.dev)\/)(.+)$/i.exec(raw)?.[1]
	if (ar) {
		const res = publicHttpsUrl(`https://arweave.net/${ar.replace(/^\/+/, '')}`) ?? ''
		return isInvalidNftMedia(res) ? '' : res
	}
	const res = publicHttpsUrl(raw) ?? ''
	return isInvalidNftMedia(res) ? '' : res
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
const SPAM = /phish|phishing|scam|fake|fraud|drainer|honeypot|malicious|\b\d[\d,.]*\s*(?:k\b|m\b|\$|usdt|usdc|eth|weth|steth|ton|sol|uni|ldo|shib|btc|wbtc|bnb|busd|matic|pol|polygon|arb|op|pepe|doge|trx|dai|avax)\b|(?:\$|€|£)\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:\$|usd|eur)|reward|claim|airdrop|voucher|giveaway|\bgift\b|(?:gift|mystery|loot|blind|lucky|treasure|reward|bonus)\s*box\b|giftbox|bonus|eligible|eligibility|winner|selected|visit|scratch\s*cards?|scratchcard|lottery|casino|lucky\s*spin|spin\s*to\s*win|raffle|promo\b|whitelist\s*raffle|free\s*mint|instant\s*mint|https?:|www\.|\bt\.me\/|\bdiscord\.gg\/|\.(com|io|xyz|net|org|app|site|top|vip|pro|gift|fun|lol|cc|ly|me|gg|to|link|click|live|info|space|online|tech|pw|win|work|claims?|claims?-?\w+)\b/i

const OAT = /\b(oat|poap)\b|galxe|galaxy oat|layer3 cube|quest3|questn|taskon/i

export function isOat(name: string, collection: string): boolean {
	return OAT.test(collection) || OAT.test(name)
}

export function looksLikeSpam(name: string, collection: string, contract = ''): boolean {
	const raw = `${name} ${collection} ${contract}`
	// eslint-disable-next-line no-control-regex -- strip invisible control characters used in spam token names
	const text = raw.replace(/[\x00-\x1f\x7f-\x9f\u200b-\u200f\ufeff]/g, ' ').trim()
	if (/phish|phishing|scam|fraud|fake|drainer|honeypot|malicious/i.test(text)) return true
	if (isOat(name, collection) && !/claim|airdrop|voucher|giveaway|\$|\d\s*(?:usdt|usdc|eth|steth|uni|ldo)/i.test(text)) return false
	return SPAM.test(text)
}

// chain:contract:token id; a token with an address of its own (TON, Solana) is chain:address
export function nftKey(chain: string, contract: string, id = ''): string {
	return id ? `${chain}:${contract.toLowerCase()}:${id.trim().toLowerCase()}` : `${chain}:${contract.toLowerCase()}`
}

// OpenSea's shared storefronts hold the tokens of every creator in one contract; a token's id starts
// with its creator's address, so one contract is many collections. The contract says its own name.
export function storefrontCreator(id: string): string {
	return `0x${idHex(id).padStart(64, '0').slice(0, 40)}`
}

export function isStorefrontName(name: string): boolean {
	return /^opensea (?:collections|shared storefront)\b/i.test(name.trim())
}

// Listed on OpenSea by its creator and never sold: a balance but no transaction yet. Only a storefront's ids start with an address.
export function lazyMinted(id: string, wallets: string[]): boolean {
	return id.length > 60 && wallets.some(wallet => wallet.toLowerCase() === storefrontCreator(id))
}

// A deleted note's keys. A contract counts as hidden by its own key or address, or when every token
// held from it was deleted; a token id alone means nothing, ids repeat across contracts and chains.
export function nftIsHidden(deleted: Set<string>, key: string, contract: string, tokenIds: string[]): boolean {
	const own = key.toLowerCase()
	const address = contract.trim().toLowerCase()
	// one creator's part of a shared contract: the contract as a whole says nothing about it
	const shared = own.split(':').length > 2
	if (deleted.has(own) || (!shared && address && deleted.has(address))) return true
	const base = own.split(':').slice(0, 2).join(':')
	const ids = tokenIds.map(id => id.trim().toLowerCase().replace(/^#/, '')).filter(Boolean)
	return ids.length > 0 && ids.every(id => deleted.has(`${base}:${id}`) || (address && deleted.has(`${address}:${id}`)))
}

const ZERO_ADDRESS = /^0x0+(?:\.+0+)?$/i

// Minted is the earliest transfer from the zero address, Acquired the latest transfer: none is left
// empty rather than guessed. Rows come from a note's History or from the explorer.
export function historyDates(rows: { from?: unknown; timeStamp?: unknown; timestamp?: unknown; date?: unknown }[]): { minted: string; acquired: string } {
	let minted = 0
	let acquired = 0
	let mintedText = ''
	let acquiredText = ''
	for (const row of rows) {
		const raw = row.timeStamp ?? row.timestamp ?? row.date
		const time = raw && raw !== '-' ? parseDate(raw) : 0
		if (time <= 0) continue
		const text = dmyOf(raw) || (typeof raw === 'string' ? raw : '')
		if (time > acquired) { acquired = time; acquiredText = text }
		if (ZERO_ADDRESS.test(typeof row.from === 'string' ? row.from : '') && (minted === 0 || time < minted)) { minted = time; mintedText = text }
	}
	return { minted: mintedText, acquired: acquiredText }
}

// A row's hash may be a bare hash or a whole explorer link.
export function txHashOf(value: unknown): string {
	return typeof value === 'string' ? /0x[0-9a-fA-F]{64}/.exec(value)?.[0] ?? '' : ''
}

// The block of an EVM transaction: the explorer's API, else the chain's public RPC.
export async function txBlock(chain: string, hash: string): Promise<string> {
	const host = BLOCKSCOUT[chain]
	try {
		if (host) {
			const json = await explorerJson(`https://${host}/api/v2/transactions/${hash}`) as { block_number?: unknown; block?: unknown } | null
			const block = json?.block_number ?? json?.block
			if (typeof block === 'number' || (typeof block === 'string' && /^\d+$/.test(block))) return String(block)
		}
		const rpc = PUBLIC_RPC[chain] || ETHERSCAN_CHAINS[chain]?.rpc || ROUTESCAN_CHAINS[chain]?.rpc
		if (!rpc) return ''
		const resp = await requestUrl({
			url: rpc, method: 'POST', contentType: 'application/json', throw: false,
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [hash] })
		})
		const block = resp.status === 200 ? (resp.json as { result?: { blockNumber?: unknown } | null }).result?.blockNumber : ''
		return typeof block === 'string' && /^0x[0-9a-f]+$/i.test(block) ? String(parseInt(block, 16)) : ''
	} catch {
		return ''
	}
}

// Blockscout hosts for the EVM chains it indexes.
export const BLOCKSCOUT: Record<string, string> = {
	Ethereum: 'eth.blockscout.com',
	Optimism: 'optimism.blockscout.com',
	Base: 'base.blockscout.com',
	Arbitrum: 'arbitrum.blockscout.com',
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
	Lisk: 'blockscout.lisk.com',
	'World Chain': 'worldchain-mainnet.explorer.alchemy.com',
	Metis: 'andromeda-explorer.metis.io',
	Rootstock: 'rootstock.blockscout.com',
	ApeChain: 'apechain.blockscout.com',
}

interface BlockscoutItem {
	id?: unknown
	token_type?: unknown
	value?: unknown
	image_url?: unknown
	metadata?: { name?: unknown; image?: unknown } | null
	token?: { address_hash?: unknown; name?: unknown; symbol?: unknown; reputation?: unknown; icon_url?: unknown; is_scam?: unknown; is_phishing?: unknown } | null
	thumbnails?: Record<string, unknown> | null
	media_url?: unknown
}

export function blockscoutTokens(chain: string, host: string, items: BlockscoutItem[]): HeldNft[] {
	const out: HeldNft[] = []
	for (const item of items) {
		const contract = typeof item.token?.address_hash === 'string' ? item.token.address_hash : ''
		const id = typeof item.id === 'string' ? item.id : ''
		const rep = typeof item.token?.reputation === 'string' ? item.token.reputation.toLowerCase() : ''
		// the explorer's own flags: scam and phishing contracts stay out
		if (!contract || rep === 'scam' || rep === 'phishing' || rep === 'spam' || rep === 'suspicious' || item.token?.is_scam === true || item.token?.is_phishing === true) continue
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
			spam: looksLikeSpam(name, collection, contract) || looksLikeSpam(symbol, '', contract),
			oat: isOat(name, collection),
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
	BNB: 'https://bsc-dataseed.binance.org',
}

// What the wallet asked for: the hashes of its own transactions, and everyone it sent one to.
// ponytail: the newest 1500 of each; an older purchase from a quiet seller may still read as a stranger's
async function walletTrust(host: string, address: string, withOwn: boolean): Promise<{ own: Set<string>; peers: Set<string>; incoming: Map<string, { tx: string; from: string; time: string; block: string }> }> {
	const own = new Set<string>()
	const peers = new Set<string>()
	const incoming = new Map<string, { tx: string; from: string; time: string; block: string }>()
	const walk = async (path: string, take: (item: Record<string, unknown>) => void): Promise<void> => {
		let next = ''
		for (let page = 0; page < 30; page++) {
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
		const block = typeof item.block_number === 'number' || typeof item.block_number === 'string' ? String(item.block_number) : ''
		if (contract && typeof id === 'string' && !incoming.has(`${contract}:${id}`)) incoming.set(`${contract}:${id}`, { tx: tx.toLowerCase(), from: hashOf(item.from), time, block })
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
	const mint = items.find(item => !item.from || /^0x0{40}$/i.test(hashOf(item.from)) || item.type === 'token_minting' || item.type === 'token_spawning') ?? items[items.length - 1]
	const ts = mint?.timestamp ?? mint?.block_timestamp ?? mint?.created_at
	return typeof ts === 'string' || typeof ts === 'number' ? String(ts) : ''
}

async function blockscoutHeld(chain: string, host: string, address: string, known: (key: string) => KnownToken | undefined): Promise<NftRead> {
	const held: HeldNft[] = []
	let next = ''
	for (let page = 0; page < 40; page++) {
		const data = await explorerJson(`https://${host}/api/v2/addresses/${address}/nft?type=ERC-721,ERC-1155${next}`) as { items?: BlockscoutItem[]; next_page_params?: Record<string, unknown> | null } | null
		if (!data || !Array.isArray(data.items)) return { held, chains: [] }
		held.push(...blockscoutTokens(chain, host, data.items))
		if (!data.next_page_params) {
			if (held.length === 0) return { held, chains: [chain] }
			// a contract nobody verified is how airdrop spam ships: it goes with the spam
			const verified = new Map<string, { unverified: boolean; spam: boolean }>()
			for (const token of held) {
				const contract = /\/token\/(0x[0-9a-fA-F]{40})\//.exec(token.url)?.[1] ?? ''
				if (!contract || token.spam) continue
				if (!verified.has(contract)) {
					const info = await explorerJson(`https://${host}/api/v2/addresses/${contract}`) as { is_verified?: unknown; is_scam?: unknown; is_phishing?: unknown; reputation?: unknown } | null
					if (info) {
						const rep = typeof info.reputation === 'string' ? info.reputation.toLowerCase() : ''
						const isPhish = info.is_scam === true || info.is_phishing === true || rep === 'scam' || rep === 'phishing' || rep === 'spam'
						const unverified = info.is_verified === false
						verified.set(contract, { unverified, spam: isPhish || unverified })
					} else {
						verified.set(contract, { unverified: false, spam: false })
					}
				}
				const v = verified.get(contract)
				if (v?.spam) token.spam = true
				if (v?.unverified) token.unverified = true
			}
			// a token the wallet asked for is not spam, whatever its name or contract says; the wallet's
			// history is read only on a network where something looks like spam
			const trust = await walletTrust(host, address, held.some(token => token.spam))
			for (const token of held) {
				const contract = (token.contract ?? '').toLowerCase()
				const came = trust.incoming.get(`${contract}:${token.tokenId ?? ''}`)
				if (came?.time) token.acquired = came.time
				if (came) {
					token.tx = { hash: came.tx, from: came.from, timeStamp: came.time, tokenId: token.tokenId, ...(came.block ? { blockNumber: came.block } : {}) }
				}
				if (!token.spam) continue
				if (token.unverified) continue
				token.trusted = trust.peers.has(contract) || (!!came && (trust.own.has(came.tx) || trust.peers.has(came.from)))
				if (token.trusted) token.spam = false
			}
			// the mint date is asked once per token: a note that has it keeps it
			for (const token of held) {
				if (token.spam || !token.contract || !token.tokenId) continue
				const minted = known(token.key)?.minted
				token.minted = minted || await mintedAt(host, token.contract, token.tokenId)
				if (!token.acquired && token.minted) token.acquired = token.minted
				if (!minted) await sleep(40)
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
				await sleep(40)
			}
			return { held, chains: [chain] }
		}
		next = '&' + new URLSearchParams(Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)])).toString()
	}
	return { held, chains: [] }
}

// BNB, Taiko and Polygon: the transfers Etherscan lists, replayed into what the wallet holds now.
const ETHERSCAN_CHAINS: Record<string, { id: number; rpc: string; site: string; nftscan?: string }> = {
	BNB: { id: 56, rpc: 'https://bsc-dataseed.binance.org', site: 'bscscan.com', nftscan: 'bnb.nftscan.com' },
	Taiko: { id: 167000, rpc: 'https://rpc.mainnet.taiko.xyz', site: 'taikoscan.io' },
	Polygon: { id: 137, rpc: 'https://polygon-bor-rpc.publicnode.com', site: 'polygonscan.com', nftscan: 'polygon.nftscan.com' },
}

// Routescan answers Etherscan's calls for these networks, keyless.
const ROUTESCAN_CHAINS: Record<string, { id: number; rpc: string; site: string }> = {
	Avalanche: { id: 43114, rpc: 'https://api.avax.network/ext/bc/C/rpc', site: 'snowtrace.io' },
	Blast: { id: 81457, rpc: 'https://rpc.blast.io', site: 'blastexplorer.io' },
	Mantle: { id: 5000, rpc: 'https://rpc.mantle.xyz', site: 'mantlescan.xyz' },
	Boba: { id: 288, rpc: 'https://mainnet.boba.network', site: 'bobascan.com' },
	Hemi: { id: 43111, rpc: 'https://rpc.hemi.network/rpc', site: 'explorer.hemi.xyz' },
	Chiliz: { id: 88888, rpc: 'https://rpc.chiliz.com', site: 'chiliscan.com' },
}

interface EtherscanTransfer {
	from?: string
	to?: string
	contractAddress?: string
	tokenID?: string
	tokenName?: string
	tokenValue?: string
	hash?: string
	blockNumber?: string
	timeStamp?: string
}

export interface ReplayedTransfer {
	contract: string
	id: string
	collection: string
	count: number
	tx?: NftTx
}

export function replayTransfers(address: string, transfers: EtherscanTransfer[]): ReplayedTransfer[] {
	const me = address.toLowerCase()
	const held = new Map<string, ReplayedTransfer>()
	for (const t of transfers) {
		const contract = (t.contractAddress ?? '').toLowerCase()
		const id = t.tokenID ?? ''
		if (!contract || !id) continue
		const key = `${contract}:${id}`
		const amount = Math.max(1, Number(t.tokenValue) || 1)
		const tx: NftTx | undefined = t.hash ? { hash: t.hash, from: t.from, to: t.to, blockNumber: t.blockNumber, timeStamp: t.timeStamp, tokenId: id } : undefined
		const entry = held.get(key) ?? { contract, id, collection: t.tokenName || contract, count: 0, tx }
		if ((t.to ?? '').toLowerCase() === me) {
			entry.count += amount
			if (tx) entry.tx = tx
		}
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
	const img = metadata?.image || metadata?.image_data || metadata?.animation_url || metadata?.artifactUri || metadata?.displayUri || metadata?.thumbnail_url
	let resolved = mediaUrl(img)
	if (resolved && (/\.json(\?|$)/i.test(resolved) || resolved.startsWith('data:application/json'))) {
		const sub = await tokenMetadata(resolved)
		const subImg = sub?.image || sub?.image_data || sub?.animation_url || sub?.artifactUri || sub?.displayUri || sub?.thumbnail_url
		if (subImg) resolved = mediaUrl(subImg)
	}
	return { name: typeof metadata?.name === 'string' ? metadata.name.trim() : '', image: resolved }
}

async function tokenImage(rpc: string, contract: string, id: string): Promise<string> {
	return (await tokenMeta(await tokenUri(rpc, contract, id))).image
}

async function tokenMetadata(uri: string): Promise<{ image?: unknown; name?: unknown; image_data?: unknown; animation_url?: unknown; artifactUri?: unknown; displayUri?: unknown; thumbnail_url?: unknown } | null> {
	const inline = /^data:application\/json(;base64)?,(.*)$/i.exec(uri)
	try {
		if (inline) return JSON.parse(inline[1] ? atob(inline[2] ?? '') : decodeURIComponent(inline[2] ?? '')) as { image?: unknown; name?: unknown; image_data?: unknown; animation_url?: unknown; artifactUri?: unknown; displayUri?: unknown; thumbnail_url?: unknown }
		const ipfsMatch = /^(?:ipfs:\/\/|https?:\/\/(?:[^/]+\/)?ipfs\/)(?:ipfs\/)?(.+)$/i.exec(uri)?.[1]
		if (ipfsMatch) {
			const path = ipfsMatch.replace(/^\/+/, '')
			for (const gw of IPFS_GATEWAYS) {
				const gwUrl = publicHttpsUrl(`${gw}${path}`)
				if (!gwUrl) continue
				try {
					const answer = await requestUrl({ url: gwUrl, throw: false })
					if (answer.status === 200) {
						let parsed: Record<string, unknown> | null = (answer.json && typeof answer.json === 'object') ? (answer.json as Record<string, unknown>) : null
						if (!parsed && answer.text) {
							try {
								parsed = JSON.parse(answer.text) as Record<string, unknown>
							} catch {
								// not json
							}
						}
						if (parsed) return parsed
					}
				} catch {
					// next gateway
				}
			}
			return null
		}
		const url = mediaUrl(uri)
		if (!url) return null
		const answer = await requestUrl({ url, throw: false })
		if (answer.status === 200) {
			let parsed: Record<string, unknown> | null = (answer.json && typeof answer.json === 'object') ? (answer.json as Record<string, unknown>) : null
			if (!parsed && answer.text) {
				try {
					parsed = JSON.parse(answer.text) as Record<string, unknown>
				} catch {
					// not json
				}
			}
			return parsed
		}
		return null
	} catch {
		return null
	}
}

// A list of transfers can miss one going out: the chain has the last word. A token it does not answer for stays.
async function stillHeld<T extends { contract?: string; tokenId?: string }>(rpc: string, address: string, tokens: T[]): Promise<T[]> {
	const word = (hex: string): string => hex.replace(/^0x/, '').padStart(64, '0')
	const call = async (to: string, data: string): Promise<string> => {
		const resp = await requestUrl({ url: rpc, method: 'POST', contentType: 'application/json', throw: false, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }) })
		const result = resp.status === 200 ? (resp.json as { result?: unknown }).result : ''
		return typeof result === 'string' ? result : ''
	}
	const owns = async (token: T): Promise<boolean> => {
		const hex = idHex(token.tokenId ?? '')
		if (!token.contract || !hex) return true
		try {
			const owner = await call(token.contract, `0x6352211e${word(hex)}`)
			if (owner.length >= 66) return owner.slice(-40).toLowerCase() === address.slice(2).toLowerCase()
			const balance = await call(token.contract, `0x00fdd58e${word(address)}${word(hex)}`)
			return balance.length < 66 || /[1-9a-f]/i.test(balance.slice(2))
		} catch {
			return true
		}
	}
	const kept: T[] = []
	for (let at = 0; at < tokens.length; at += 8) {
		const part = tokens.slice(at, at + 8)
		const answers = await Promise.all(part.map(owns))
		part.forEach((token, i) => { if (answers[i]) kept.push(token) })
	}
	return kept
}

async function etherscanHeld(chain: string, address: string, key: string): Promise<NftRead> {
	const info = ETHERSCAN_CHAINS[chain]
	if (!info) return { held: [], chains: [] }
	return transfersHeld(chain, info, address, action => `https://api.etherscan.io/v2/api?chainid=${String(info.id)}&module=account&action=${action}&address=${address}&startblock=0&endblock=999999999&sort=asc&apikey=${encodeURIComponent(key)}`)
}

// Networks where Routescan sees a wallet's NFTs; null when it could not say, and every network is read.
async function routescanActive(address: string): Promise<Set<string> | null> {
	const chains = new Set<string>()
	try {
		for (const kind of ['erc721-holdings', 'erc1155-holdings']) {
			let path = `/v2/network/mainnet/evm/all/address/${address}/${kind}?limit=100`
			for (let page = 0; page < 20 && path; page++) {
				const resp = await requestUrl({ url: `https://api.routescan.io${path}`, throw: false })
				if (resp.status !== 200) return null
				const data = resp.json as { items?: { chainId?: unknown }[]; link?: { next?: unknown } }
				for (const item of data.items ?? []) if (typeof item.chainId === 'string') chains.add(item.chainId)
				path = typeof data.link?.next === 'string' ? data.link.next : ''
			}
		}
		return chains
	} catch {
		return null
	}
}

function routescanHeld(chain: string, address: string): Promise<NftRead> {
	const info = ROUTESCAN_CHAINS[chain]
	if (!info) return Promise.resolve({ held: [], chains: [] })
	return transfersHeld(chain, info, address, action =>
		`https://api.routescan.io/v2/network/mainnet/evm/${String(info.id)}/etherscan/api?module=account&action=${action}&address=${address}&page=1&offset=10000&sort=asc`)
}

async function transfersHeld(chain: string, info: { rpc: string; site: string }, address: string, url: (action: string) => string): Promise<NftRead> {
	const transfers: EtherscanTransfer[] = []
	for (const action of ['tokennfttx', 'token1155tx']) {
		try {
			const answer = await requestUrl({ url: url(action), throw: false })
			const data = answer.json as { message?: string; result?: unknown }
			if (Array.isArray(data.result)) transfers.push(...data.result as EtherscanTransfer[])
			else if (data.message !== 'No transactions found') return { held: [], chains: [] }
		} catch {
			return { held: [], chains: [] }
		}
	}
	const held: HeldNft[] = []
	const owned = await stillHeld(info.rpc, address, replayTransfers(address, transfers).map(token => ({ ...token, tokenId: token.id })))
	for (const token of owned) {
		held.push({
			key: nftKey(chain, token.contract, token.id),
			tokenId: token.id,
			chain,
			collection: token.collection,
			name: `${token.collection} #${token.id}`,
			image: await tokenImage(info.rpc, token.contract, token.id),
			url: `https://${info.site}/nft/${token.contract}/${token.id}`,
			count: token.count,
			contract: token.contract,
			tx: token.tx,
			spam: looksLikeSpam(token.collection, token.collection), oat: isOat(token.collection, token.collection),
		})
	}
	return { held, chains: [chain] }
}

// Runs inside the explorer's NFT transfers page: its table, 100 rows a page, every page.
const TRANSFERS_PAGE = "(async () => {\n\tconst sleep = (ms) => new Promise((r) => setTimeout(r, ms))\n\tconst ready = () => window.jQuery && jQuery.fn.dataTable && jQuery.fn.dataTable.isDataTable('#datatable') && document.querySelector('#datatable tbody tr a[href*=\"/nft/\"]')\n\tfor (let i = 0; i < 60 && !ready(); i++) await sleep(500)\n\tif (!ready()) return ''\n\tconst dt = jQuery('#datatable').DataTable()\n\tconst rows = []\n\tconst grab = () => {\n\t\tfor (const tr of document.querySelectorAll('#datatable tbody tr')) {\n\t\t\tconst link = [...tr.querySelectorAll('a[href*=\"/nft/\"]')].pop()\n\t\t\tconst m = link && /\\/nft\\/(0x[0-9a-fA-F]{40})\\/(\\d+)/.exec(link.getAttribute('href') || '')\n\t\t\tif (!m) continue\n\t\t\tconst cells = [...tr.cells].map((c) => c.innerText.replace(/\\s+/g, ' ').trim())\n\t\t\tconst isScam = /phish|phishing|scam|fake|drainer/i.test(tr.innerText) || /phish|scam/i.test(link.getAttribute('href') || '')\n\t\t\tconst timeEl = tr.querySelector('.showDate span, .showDate, .showLocalDateNFT span, .showLocalDateNFT, [data-bs-title], [title]')\n\t\t\tconst time = timeEl ? ((timeEl.textContent || '').trim() || timeEl.getAttribute('data-bs-title') || timeEl.getAttribute('title') || '') : ''\n\t\t\tconst txEl = tr.querySelector('a[href*=\"tx/0x\"], a[href*=\"/tx/\"]')\n\t\t\tconst hash = txEl ? (txEl.getAttribute('href') || '').replace(/^.*tx\\//, '').split('?')[0].split('#')[0] : ''\n\t\t\tconst fromEl = tr.querySelector('a[href*=\"address/0x\"], a[href*=\"/address/\"]')\n\t\t\tconst from = fromEl ? (fromEl.getAttribute('href') || '').replace(/^.*address\\//, '').split('?')[0].split('#')[0] : ''\n\t\t\tconst blockEl = tr.querySelector('a[href*=\"block/\"], a[href*=\"/block/\"]')\n\t\t\tconst block = blockEl ? blockEl.innerText.trim() : ''\n\t\t\tconst imgEl = tr.querySelector('img[src*=\"assetquay.com\"], img[src*=\"nftimagebucket\"], img[src*=\"seadn.io/matic/\"], img[src*=\"seadn.io/files/\"], img[src*=\"/ipfs/\"], img[src*=\"arweave\"]')\n\t\t\tconst rawSrc = imgEl ? (imgEl.getAttribute('src') || '') : ''\n\t\t\tconst image = /boredapeyachtclub|1a09c26b1c30427b26944c47fc7bb9/i.test(rawSrc) ? '' : rawSrc\n\t\t\trows.push({ contract: m[1].toLowerCase(), id: m[2], dir: cells.find((t) => /^(IN|OUT|SELF)$/.test(t)) || '', link: link.innerText.trim(), type: cells.find((t) => /-(721|1155)$/.test(t)) || '', time, hash, from, block, image, isScam })\n\t\t}\n\t}\n\tconst page = (fn) => new Promise((resolve) => { dt.one('draw', () => resolve()); fn(); setTimeout(resolve, 20000) })\n\tawait page(() => dt.page.len(100).draw('page'))\n\tconst pages = dt.page.info().pages\n\tfor (let p = 0; p < pages && p < 40; p++) {\n\t\tif (p > 0) await page(() => dt.page(p).draw('page'))\n\t\tgrab()\n\t}\n\treturn JSON.stringify(pages <= 40 ? rows : null)\n})()"

interface PageTransfer {
	contract?: string
	id?: string
	dir?: string
	link?: string
	type?: string
	time?: string
	hash?: string
	from?: string
	block?: string
	image?: string
	isScam?: boolean
}

// One pass, so a decoded "&" never starts a second entity; "&amp;" repeated in front is double encoding.
export function decodeHtmlEntities(str: string): string {
	const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
	return str.replace(/&(?:amp;)*(?:(amp|lt|gt|quot|apos);|#(\d+);?)/g, (_, name: string | undefined, code: string | undefined) =>
		name ? named[name] ?? '' : String.fromCharCode(Number(code)))
}

// The transfers page's rows replayed: what came in and did not go out again.
export function pageHeld(chain: string, site: string, rows: PageTransfer[]): Array<HeldNft & { contract: string; id: string }> {
	const net = new Map<string, { contract: string; id: string; count: number; link: string; time?: string; tx?: NftTx; image?: string; isScam?: boolean }>()
	const types = new Map<string, string>()
	for (const row of rows) {
		if (!row.contract || !row.id || (row.dir !== 'IN' && row.dir !== 'OUT')) continue
		const key = `${row.contract}:${row.id}`
		if (row.type) types.set(key, row.type)
		const entry = net.get(key) ?? { contract: row.contract, id: row.id, count: 0, link: row.link ?? '', time: row.time, isScam: row.isScam }
		entry.count += row.dir === 'IN' ? 1 : -1
		if (row.isScam) entry.isScam = true
		if (row.dir === 'IN' && row.hash) {
			entry.tx = {
				hash: row.hash.startsWith('http') ? row.hash : `https://${site}/tx/${row.hash}`,
				from: row.from ? row.from.replace(/#.*$/, '') : '',
				blockNumber: row.block || '',
				timeStamp: row.time || '',
				tokenId: row.id || ''
			}
		}
		if (row.image && !entry.image) entry.image = row.image
		if (row.time && (!entry.time || parseDate(row.time) > parseDate(entry.time))) entry.time = row.time
		net.set(key, entry)
	}
	const out: Array<HeldNft & { contract: string; id: string }> = []
	for (const { contract, id, count, link, time, tx, image, isScam } of net.values()) {
		if (count <= 0) continue
		// the explorer's "NFT:" label is not part of the name
		const [first = '', second = ''] = decodeHtmlEntities(link).split('\n').map(line => line.trim().replace(/^NFT:\s*/, ''))
		const collection = second || first || contract
		const name = first && first.indexOf(id) >= 0 ? first : `${first || collection} #${id}`
		out.push({
			key: nftKey(chain, contract, id),
			chain,
			collection,
			name,
			image: image || '',
			url: `https://${site}/nft/${contract}/${id}`,
			count,
			spam: isScam === true || looksLikeSpam(name, collection, contract),
			oat: isOat(name, collection),
			contract,
			id,
			tokenId: id,
			standard: types.get(`${contract}:${id}`) ?? '',
			acquired: time,
			minted: time,
			tx
		})
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
	const held = await stillHeld(info.rpc, address, pageHeld(chain, info.site, rows))
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
		out.push({ key: nftKey('TON', address), chain: 'TON', collection, name, contract: typeof item.collection?.address === 'string' ? item.collection.address : '', image: mediaUrl(preview) || mediaUrl(item.metadata?.image), url: `https://tonviewer.com/${address}`, count: 1, spam: looksLikeSpam(name, collection) || item.trust === 'graylist', oat: isOat(name, collection), standard: 'TEP-62', tokenId: address })
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
export const EVM_NETWORKS = ['Ethereum', 'Optimism', 'Base', 'Arbitrum', 'Polygon', 'BNB', 'Taiko', 'Gnosis', 'Celo', 'zkSync', 'Scroll', 'Ink', 'Soneium', 'Unichain', 'Mode', 'Arbitrum Nova', 'Shape', 'Robinhood', 'Lisk', 'World Chain', 'Metis', 'Rootstock', 'ApeChain', 'Avalanche', 'Blast', 'Mantle', 'Boba', 'Hemi', 'Chiliz']
export const WALLET_FIELD = 'Wallets'

export interface WalletPair {
	chain: string
	address: string
}

// One list of addresses: each kind is read on its networks, an EVM address on every EVM network.
export function walletPairs(fields: Record<string, string>): WalletPair[] {
	const out: WalletPair[] = []
	const single: Partial<Record<WalletKind, string>> = { ton: 'TON', solana: 'Solana', near: 'NEAR', tezos: 'Tezos' }
	for (const wallet of parseWallets(Object.keys(fields).map(key => fields[key]).join('\n'))) {
		const chains = wallet.kind === 'evm' ? EVM_NETWORKS : [single[wallet.kind] ?? '']
		for (const chain of chains) {
			if (chain && !out.some(p => p.chain === chain && p.address.toLowerCase() === wallet.address.toLowerCase())) out.push({ chain, address: wallet.address })
		}
	}
	return out
}

export function explorerSite(chain: string): string {
	if (chain === 'Ethereum') return 'etherscan.io'
	if (chain === 'Optimism') return 'optimistic.etherscan.io'
	if (chain === 'Base') return 'basescan.org'
	if (chain === 'Arbitrum') return 'arbiscan.io'
	if (chain === 'Polygon') return 'polygonscan.com'
	if (chain === 'BNB') return 'bscscan.com'
	if (chain === 'Taiko') return 'taikoscan.io'
	if (chain === 'zkSync') return 'era.zksync.network'
	if (chain === 'Scroll') return 'scrollscan.com'
	if (chain === 'Solana') return 'solscan.io'
	if (chain === 'TON') return 'tonviewer.com'
	if (chain === 'NEAR') return 'nearblocks.io'
	if (chain === 'Tezos') return 'tzkt.io'
	return ROUTESCAN_CHAINS[chain]?.site || BLOCKSCOUT[chain] || 'etherscan.io'
}

export function explorerContractUrl(chain: string, contract: string): string {
	const host = explorerSite(chain)
	if (chain === 'TON' || chain === 'Tezos') return `https://${host}/${contract}`
	if (chain === 'Solana') return `https://${host}/account/${contract}`
	if (chain === 'NEAR') return `https://${host}/nft-tokens/${contract}`
	return `https://${host}/token/${contract}`
}

export function explorerTokenUrl(chain: string, contract: string, tokenId: string): string {
	const host = explorerSite(chain)
	if (chain === 'TON') return `https://${host}/${tokenId || contract}`
	if (chain === 'Solana') return `https://${host}/token/${tokenId || contract}`
	if (chain === 'NEAR') return `https://${host}/nft-tokens/${contract}/tokens/${tokenId}`
	if (chain === 'Tezos') return `https://${host}/${contract}/tokens/${tokenId}`
	if (BLOCKSCOUT[chain] === host) {
		return `https://${host}/token/${contract}/instance/${tokenId}`
	}
	return `https://${host}/nft/${contract}/${tokenId}`
}

export function explorerAddressUrl(chain: string, address: string): string {
	return `https://${explorerSite(chain)}/address/${address}`
}

export function explorerTxUrl(chain: string, hash: string): string {
	if (/^https?:\/\//i.test(hash)) return hash
	const host = explorerSite(chain)
	if (chain === 'TON') return `https://${host}/transaction/${hash}`
	if (chain === 'NEAR') return `https://${host}/txns/${hash}`
	if (chain === 'Tezos') return `https://${host}/${hash}`
	return `https://${host}/tx/${hash}`
}

export function explorerBlockUrl(chain: string, block: string): string {
	const host = explorerSite(chain)
	const clean = block.replace(/^.*\/block(?:s)?\//i, '').trim()
	if (!clean || clean === '-') return ''
	if (chain === 'NEAR') return `https://${host}/blocks/${clean}`
	return `https://${host}/block/${clean}`
}

export interface OpenSeaContractInfo {
	name?: string
	description?: string
	imageUrl?: string
	bannerImageUrl?: string
}

export const OPENSEA_CHAINS: Record<string, string> = {
	Ethereum: 'ethereum',
	Polygon: 'matic',
	Arbitrum: 'arbitrum',
	Optimism: 'optimism',
	Base: 'base',
	BNB: 'bsc',
	zkSync: 'zksync',
	Avalanche: 'avalanche',
	Solana: 'solana',
	Blast: 'blast',
	ApeChain: 'ape_chain',
	Shape: 'shape',
	Unichain: 'unichain',
	Soneium: 'soneium',
	Robinhood: 'robinhood',
}

const creatorOnPage = (html: string): string => /Contract Creator[\s\S]{0,800}?href=['"]\/address\/(0x[0-9a-fA-F]{40})/i.exec(html)?.[1] ?? ''

// Who deployed a contract: the explorer's own answer.
export async function contractCreator(chain: string, contract: string, etherscanKey = ''): Promise<string | null> {
	const clean = (value: unknown): string => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) ? value : ''
	try {
		const host = BLOCKSCOUT[chain]
		if (host) {
			const info = await explorerJson(`https://${host}/api/v2/addresses/${contract}`) as { creator_address_hash?: unknown } | null
			return info ? clean(info.creator_address_hash) : null
		}
		const routescan = ROUTESCAN_CHAINS[chain]
		const etherscan = ETHERSCAN_CHAINS[chain]
		// without a key the explorer's own page says it; a page behind a challenge opens in the hidden browser
		if (etherscan && !etherscanKey) {
			const page = `https://${etherscan.site}/address/${contract}`
			const plain = await requestUrl({ url: page, throw: false })
			return creatorOnPage(plain.status === 200 ? plain.text : await readPage(page, 'new XMLSerializer().serializeToString(document)', 30000, "!!document.querySelector('h4')"))
		}
		const url = routescan ? `https://api.routescan.io/v2/network/mainnet/evm/${String(routescan.id)}/etherscan/api?module=contract&action=getcontractcreation&contractaddresses=${contract}`
			: etherscan && etherscanKey ? `https://api.etherscan.io/v2/api?chainid=${String(etherscan.id)}&module=contract&action=getcontractcreation&contractaddresses=${contract}&apikey=${encodeURIComponent(etherscanKey)}` : ''
		if (!url) return ''
		const resp = await requestUrl({ url, throw: false })
		const rows = resp.status === 200 ? (resp.json as { result?: unknown }).result : null
		return Array.isArray(rows) ? clean((rows[0] as { contractCreator?: unknown } | undefined)?.contractCreator) : ''
	} catch {
		return null
	}
}

interface OpenSeaCollection {
	opensea_url?: unknown
	project_url?: unknown
	wiki_url?: unknown
	discord_url?: unknown
	telegram_url?: unknown
	twitter_username?: unknown
	instagram_username?: unknown
	owner?: unknown
}

interface OpenSeaAccount {
	website?: unknown
	social_media_accounts?: { platform?: unknown; username?: unknown }[]
}

const handleUrl = (site: string, handle: unknown): string => typeof handle === 'string' && handle.trim() ? `https://${site}/${handle.trim().replace(/^@/, '')}` : ''

export function projectLinks(collection: OpenSeaCollection, account: OpenSeaAccount | null = null): string[] {
	const social = (platform: string): unknown => account?.social_media_accounts?.find(item => item.platform === platform)?.username
	const raw = [
		collection.project_url, account?.website, handleUrl('x.com', collection.twitter_username) || handleUrl('x.com', social('twitter')),
		collection.discord_url, collection.telegram_url, handleUrl('instagram.com', collection.instagram_username) || handleUrl('instagram.com', social('instagram')),
		collection.wiki_url, collection.opensea_url,
	]
	const out: string[] = []
	for (const value of raw) {
		const url = typeof value === 'string' ? publicHttpsUrl(value.replace(/^http:/i, 'https:')) ?? '' : ''
		if (url && out.indexOf(url) < 0) out.push(url)
	}
	return out
}

// A collection's site and socials from OpenSea, keyless; with a key the creator's own profile adds to them.
export async function openseaLinks(chain: string, contract: string, apiKey = '', storefrontToken = ''): Promise<string[]> {
	const osChain = OPENSEA_CHAINS[chain]
	if (!osChain) return []
	const headers: Record<string, string> = { accept: 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) }
	const read = async <T>(path: string): Promise<T | null> => {
		const resp = await requestUrl({ url: `https://api.opensea.io/api/v2/${path}`, headers, throw: false })
		return resp.status === 200 ? resp.json as T : null
	}
	try {
		// a shared storefront's contract answers with OpenSea's own collection: the token knows its real one, with a key
		if (storefrontToken && !apiKey) return []
		const slug = storefrontToken ? (await read<{ nft?: { collection?: unknown } }>(`chain/${osChain}/contract/${contract.toLowerCase()}/nfts/${storefrontToken}`))?.nft?.collection
			: (await read<{ collection?: unknown }>(`chain/${osChain}/contract/${contract.toLowerCase()}`))?.collection
		if (typeof slug !== 'string' || !slug) return []
		const collection = await read<OpenSeaCollection>(`collections/${encodeURIComponent(slug)}`)
		if (!collection) return []
		const owner = typeof collection.owner === 'string' ? collection.owner : ''
		return projectLinks(collection, apiKey && owner ? await read<OpenSeaAccount>(`accounts/${owner}`) : null)
	} catch {
		return []
	}
}

export async function openseaContract(chain: string, contract: string, apiKey?: string): Promise<OpenSeaContractInfo | null> {
	if (!apiKey || !contract) return null
	const osChain = OPENSEA_CHAINS[chain]
	if (!osChain) return null
	try {
		const res = await requestUrl({
			url: `https://api.opensea.io/api/v2/chain/${osChain}/contract/${contract.toLowerCase()}`,
			headers: { 'x-api-key': apiKey, 'accept': 'application/json' },
			throw: false,
		})
		if (res.status !== 200 || !res.json) return null
		const data = res.json as { name?: string; description?: string; image_url?: string; banner_image_url?: string; collection?: string }
		let name = typeof data.name === 'string' ? data.name : undefined
		let imageUrl = mediaUrl(data.image_url)
		let bannerImageUrl = mediaUrl(data.banner_image_url)
		let description = typeof data.description === 'string' ? data.description : undefined

		if ((!imageUrl || !name) && typeof data.collection === 'string' && data.collection) {
			try {
				const colRes = await requestUrl({
					url: `https://api.opensea.io/api/v2/collections/${data.collection}`,
					headers: { 'x-api-key': apiKey, 'accept': 'application/json' },
					throw: false,
				})
				if (colRes.status === 200 && colRes.json) {
					const col = colRes.json as { name?: string; description?: string; image_url?: string; banner_image_url?: string }
					if (!name && typeof col.name === 'string') name = col.name
					if (!imageUrl && col.image_url) imageUrl = mediaUrl(col.image_url)
					if (!bannerImageUrl && col.banner_image_url) bannerImageUrl = mediaUrl(col.banner_image_url)
					if (!description && typeof col.description === 'string') description = col.description
				}
			} catch {
				// ignore
			}
		}

		return {
			name,
			description,
			imageUrl,
			bannerImageUrl,
		}
	} catch {
		return null
	}
}

export async function openseaNftImage(chain: string, contract: string, tokenId: string, apiKey?: string): Promise<string> {
	if (!apiKey || !contract || !tokenId) return ''
	const osChain = OPENSEA_CHAINS[chain]
	if (!osChain) return ''
	try {
		const res = await requestUrl({
			url: `https://api.opensea.io/api/v2/chain/${osChain}/contract/${contract.toLowerCase()}/nfts/${tokenId}`,
			headers: { 'x-api-key': apiKey, 'accept': 'application/json' },
			throw: false,
		})
		if (res.status !== 200 || !res.json) return ''
		const nft = (res.json as { nft?: { image_url?: string; display_image_url?: string; display_animation_url?: string; animation_url?: string; original_image_url?: string } }).nft
		return mediaUrl(nft?.display_image_url) || mediaUrl(nft?.image_url) || mediaUrl(nft?.display_animation_url) || mediaUrl(nft?.animation_url) || mediaUrl(nft?.original_image_url) || ''
	} catch {
		return ''
	}
}

export async function openseaAccountHeld(chain: string, address: string, apiKey: string): Promise<HeldNft[]> {
	const osChain = OPENSEA_CHAINS[chain]
	if (!osChain || !apiKey || !address) return []
	const out: HeldNft[] = []
	try {
		let next = ''
		for (let page = 0; page < 40; page++) {
		const res = await requestUrl({
			url: `https://api.opensea.io/api/v2/chain/${osChain}/account/${address.toLowerCase()}/nfts?limit=200&include_auto_hidden=true${next ? `&next=${encodeURIComponent(next)}` : ''}`,
			headers: { 'x-api-key': apiKey, 'accept': 'application/json' },
			throw: false,
		})
		if (res.status !== 200 || !res.json) return out
		const body = res.json as { nfts?: Array<Record<string, unknown>>; next?: unknown }
		const nfts = body.nfts
		if (!Array.isArray(nfts)) return out
		for (const nft of nfts) {
			const contract = typeof nft.contract === 'string' ? nft.contract : ''
			const id = typeof nft.identifier === 'string' ? nft.identifier : ''
			const name = typeof nft.name === 'string' ? nft.name : ''
			const col = typeof nft.collection === 'string' ? nft.collection : ''
			const img = mediaUrl(nft.display_image_url) || mediaUrl(nft.image_url) || mediaUrl(nft.original_image_url)
			const standard = typeof nft.token_standard === 'string' ? nft.token_standard.toUpperCase() : undefined
			let minted: string | undefined
			const traits = Array.isArray(nft.traits) ? nft.traits : []
			for (const tr of traits) {
				if (typeof tr === 'object' && tr !== null) {
					const rec = tr as Record<string, unknown>
					if (rec.trait_type === 'birthday' || rec.trait_type === 'Minted') {
						const ts = Number(rec.value)
						if (!isNaN(ts) && ts > 0) minted = dmyOf(new Date(ts * 1000).toISOString())
					}
				}
			}
			out.push({
				key: `${chain}:${contract}:${id}`,
				chain,
				contract,
				tokenId: id,
				name: name || (col ? `${col} #${id}` : id),
				collection: col || contract,
				image: img,
				url: typeof nft.opensea_url === 'string' ? nft.opensea_url : `https://opensea.io/assets/${osChain}/${contract}/${id}`,
				count: 1,
				// OpenSea's own flag also falls on real quest and attendance tokens: the name decides, as everywhere
				spam: looksLikeSpam(name, col),
				oat: isOat(name, col),
				standard,
				minted,
			})
		}
		next = typeof body.next === 'string' ? body.next : ''
		if (!next) break
		}
	} catch {
		// ignore
	}
	return out
}

interface ExplorerActivity {
	txhash?: unknown
	blockNumber?: unknown
	_from?: unknown
	dt?: unknown
}

// A token's transfers from its page on an Etherscan-family explorer, for the tokens the wallet's own
// list missed; the page carries them as data. Null when the page could not be read at all.
export async function tokenTransfers(chain: string, contract: string, id: string): Promise<NftTx[] | null> {
	const site = ETHERSCAN_CHAINS[chain]?.site
	if (!site) return null
	const page = `https://${site}/nft/${contract}/${id}`
	try {
		const plain = await requestUrl({ url: page, throw: false })
		const html = plain.status === 200 ? plain.text : await readPage(page, 'new XMLSerializer().serializeToString(document)', 30000, "!!document.querySelector('#mytable')")
		const data = /var dt_Data = (\[[\s\S]*?\]);/.exec(html)?.[1]
		if (!data) return null
		return (JSON.parse(data) as ExplorerActivity[]).map(row => ({
			hash: typeof row.txhash === 'string' ? row.txhash : '',
			from: typeof row._from === 'string' ? row._from : '',
			blockNumber: typeof row.blockNumber === 'string' ? row.blockNumber : '',
			timeStamp: typeof row.dt === 'string' ? row.dt : '',
			tokenId: id,
		})).filter(row => row.hash)
	} catch {
		return null
	}
}

export async function nearHeld(address: string): Promise<NftRead> {
	const held: HeldNft[] = []
	try {
		const contracts: Array<{ contract: string; name?: string; icon?: string }> = []
		try {
			const res = await requestUrl({
				url: `https://api.nearblocks.io/v1/account/${address}/inventory`,
				headers: { accept: 'application/json' },
				throw: false,
			})
			if (res.status === 200 && res.json) {
				const nfts = (res.json as { inventory?: { nfts?: Array<{ contract?: string; nft_meta?: { name?: string; icon?: string } }> } }).inventory?.nfts
				if (Array.isArray(nfts)) {
					for (const n of nfts) {
						if (n.contract) {
							contracts.push({
								contract: n.contract,
								name: n.nft_meta?.name,
								icon: mediaUrl(n.nft_meta?.icon),
							})
						}
					}
				}
			}
		} catch {
			// ignore
		}

		if (contracts.length === 0) {
			try {
				const res = await requestUrl({
					url: `https://api.fastnear.com/v1/account/${address}/nft`,
					headers: { accept: 'application/json' },
					throw: false,
				})
				if (res.status === 200 && res.json) {
					const tokens = (res.json as { tokens?: Array<{ contract_id?: string }> }).tokens
					if (Array.isArray(tokens)) {
						for (const t of tokens) {
							if (t.contract_id && !contracts.some(c => c.contract === t.contract_id)) {
								contracts.push({ contract: t.contract_id })
							}
						}
					}
				}
			} catch {
				// ignore
			}
		}

		for (const { contract, name: colName, icon: colIcon } of contracts) {
			try {
				const args = btoa(JSON.stringify({ account_id: address }))
				const rpcRes = await requestUrl({
					url: 'https://rpc.mainnet.near.org',
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 'library-nft',
						method: 'query',
						params: {
							request_type: 'call_function',
							finality: 'final',
							account_id: contract,
							method_name: 'nft_tokens_for_owner',
							args_base64: args,
						},
					}),
					throw: false,
				})
				if (rpcRes.status === 200 && rpcRes.json) {
					const bytes = (rpcRes.json as { result?: { result?: number[] } }).result?.result
					if (Array.isArray(bytes)) {
						const decoded = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as Array<{
							token_id?: string
							metadata?: {
								title?: string
								description?: string
								media?: string
								issued_at?: number | string
							}
						}>
						if (Array.isArray(decoded)) {
							for (const tok of decoded) {
								const id = tok.token_id ?? ''
								const title = tok.metadata?.title || (colName ? `${colName} #${id}` : id)
								const image = mediaUrl(tok.metadata?.media) || colIcon || ''
								let minted: string | undefined
								if (tok.metadata?.issued_at) {
									const ms = Number(tok.metadata.issued_at)
									if (!isNaN(ms) && ms > 0) {
										const timestamp = ms > 1e15 ? Math.floor(ms / 1e6) : (ms > 1e11 ? ms : ms * 1000)
										minted = dmyOf(new Date(timestamp).toISOString())
									}
								}
								held.push({
									key: `NEAR:${contract}:${id}`,
									chain: 'NEAR',
									contract,
									tokenId: id,
									name: title,
									collection: colName || contract,
									image,
									url: `https://nearblocks.io/nft-tokens/${contract}/tokens/${id}`,
									count: 1,
									spam: false,
									oat: false,
									standard: 'NEP-171',
									minted,
								})
							}
						}
					}
				}
			} catch {
				// ignore
			}
		}
	} catch {
		// ignore
	}
	return { held, chains: ['NEAR'] }
}

export function cleanCollectionName(raw: string, creator = '', tokenId = ''): string {
	if (creator) {
		let clean = creator.replace(/[[\]]/g, '').trim()
		if (clean.indexOf('|') >= 0) clean = clean.split('|').pop()?.trim() || clean
		clean = clean.replace(/\.canvas$/, '').trim()
		clean = decodeHtmlEntities(clean)
		clean = clean.replace(/[\s\-_.:#]+$/, '').trim()
		if (clean && !clean.startsWith('0x')) {
			if (/^quest3(?:nft)?$/i.test(clean)) return 'Quest3NFT'
			return clean
		}
	}
	let name = raw.replace(/\.md$/, '').replace(/\s*\(\d+\)$/, '').trim()
	if (name.indexOf('|') >= 0) name = name.split('|').pop()?.trim() || name
	name = decodeHtmlEntities(name)
	if (tokenId) {
		name = name.replace(new RegExp('#?' + tokenId + '$'), '').trim()
	}
	name = name.replace(/#\d+$/, '').trim()
	const digitTail = name.match(/^(.*?[a-zA-Z\s\-_])(\d{4,})$/)
	if (digitTail && digitTail[1]) {
		name = digitTail[1].trim()
	}
	name = name.replace(/[\s\-_.:#]+$/, '').trim()
	if (/^quest3(?:nft)?$/i.test(name)) {
		name = 'Quest3NFT'
	}
	return name.trim() || raw
}

// one source that never answers (a dead metadata host) must not hold the whole queue
const STEP_MS = 15000

export async function fetchNftTokenImage(chain: string, contract: string, tokenId: string, openseaKey = ''): Promise<string> {
	if (!contract || !tokenId) return ''
	if (openseaKey) {
		try {
			const osImg = await within(openseaNftImage(chain, contract, tokenId, openseaKey), STEP_MS, '')
			if (osImg && !isInvalidNftMedia(osImg)) return osImg
		} catch {
			// fallback
		}
	}
	const host = BLOCKSCOUT[chain]
	if (host) {
		try {
			const res = await within(requestUrl({ url: `https://${host}/api/v2/tokens/${contract}/instances/${tokenId}`, headers: { accept: 'application/json' }, throw: false }), STEP_MS, null)
			if (res && res.status === 200 && res.json) {
				const data = res.json as BlockscoutItem
				const img = mediaUrl(data.thumbnails?.['500x500']) || mediaUrl(data.media_url) || mediaUrl(data.image_url) || mediaUrl(data.metadata?.image)
				if (img && !isInvalidNftMedia(img)) return img
			}
		} catch {
			// fallback
		}
	}
	const rpc = PUBLIC_RPC[chain] || ETHERSCAN_CHAINS[chain]?.rpc || ROUTESCAN_CHAINS[chain]?.rpc
	if (rpc) {
		try {
			const img = await within(tokenImage(rpc, contract, tokenId), STEP_MS, '')
			if (img && !isInvalidNftMedia(img)) return img
		} catch {
			// fallback
		}
	}
	if (chain === 'BNB') {
		try {
			const img = await within(nftscanImage('bnb.nftscan.com', contract, tokenId), STEP_MS * 3, '')
			if (img && !isInvalidNftMedia(img)) return img
		} catch {
			// fallback
		}
	}
	// the token's own metadata host gone (quest3, Galxe): OpenSea keeps its copy, read from the token's page without a key
	return openseaPageImage(chain, contract, tokenId)
}

// OpenSea's cached picture of a token, read off its page in a hidden webview (desktop); '' when the page has none
export async function openseaPageImage(chain: string, contract: string, tokenId: string): Promise<string> {
	const osChain = OPENSEA_CHAINS[chain]
	if (!osChain || !contract || !tokenId) return ''
	const slug = osChain === 'matic' ? 'polygon' : osChain
	const media = `seadn.io/${osChain}/${contract.toLowerCase()}`
	// the page's own picture of this token, not another one listed beside it, at full size
	// the token's picture among the page's image sources (attributes are set even where the tiny hidden webview draws nothing), at full size
	const pick = `(() => { const src = [...document.querySelectorAll('img[src]')].map(i => i.getAttribute('src') || '').find(s => s.toLowerCase().includes(${JSON.stringify(media)})); return src ? src.split('?')[0] : '' })()`
	try {
		const found = await readPage(`https://opensea.io/item/${slug}/${contract.toLowerCase()}/${tokenId}`, pick, 45000, `${pick} !== ''`)
		return mediaUrl(found) || ''
	} catch {
		return ''
	}
}

export function groupHeldByContract(tokens: HeldNft[]): HeldContract[] {
	const map = new Map<string, HeldContract>()
	for (const token of tokens) {
		const contractAddr = (token.contract || '').trim().toLowerCase()
		const tokenId = token.tokenId?.trim()
		const storefront = token.storefront && tokenId ? storefrontCreator(tokenId) : ''
		const key = contractAddr ? `${token.chain}:${contractAddr}${storefront ? `:${storefront}` : ''}` : `${token.chain}:${token.collection.toLowerCase()}`
		const existing = map.get(key)
		const rawImage = token.image?.trim()
		const image = rawImage && !isInvalidNftMedia(rawImage) ? rawImage : ''
		const cleanName = cleanCollectionName(token.collection || token.name, '', tokenId)

		const rawTxTime = token.tx?.timeStamp
		const txTimeStr = rawTxTime ? (dmyOf(rawTxTime) || String(rawTxTime)) : ''
		const fromZero = ZERO_ADDRESS.test(token.tx?.from ?? '')
		const initialMinted = token.minted || (fromZero ? txTimeStr : '')
		const initialAcquired = token.acquired || txTimeStr || token.minted || ''

		if (!existing) {
			map.set(key, {
				key,
				chain: token.chain,
				contract: token.contract || '',
				collection: cleanName,
				name: cleanName,
				count: token.count,
				tokenIds: tokenId ? [tokenId] : [],
				tokens: [{ ...token }],
				image: image || '',
				gallery: image ? [image] : [],
				url: token.url,
				standard: token.standard,
				spam: token.spam,
				unverified: token.unverified,
				oat: token.oat,
				wallets: token.wallets ? [...token.wallets] : [],
				history: token.tx ? [token.tx] : [],
				minted: initialMinted,
				acquired: initialAcquired,
			})
		} else {
			existing.count += token.count
			if (tokenId && existing.tokenIds.indexOf(tokenId) < 0) {
				existing.tokenIds.push(tokenId)
			}
			existing.tokens.push({ ...token })
			if ((!existing.image || isInvalidNftMedia(existing.image)) && image && !isInvalidNftMedia(image)) {
				existing.image = image
			}
			if (image && !isInvalidNftMedia(image) && existing.gallery.indexOf(image) < 0) {
				existing.gallery.push(image)
			}
			if (!existing.standard && token.standard) {
				existing.standard = token.standard
			}
			const tMint = initialMinted
			if (tMint) {
				if (!existing.minted || parseDate(tMint) < parseDate(existing.minted)) {
					existing.minted = dmyOf(tMint) || tMint
				}
			}
			const tAcq = initialAcquired
			if (tAcq) {
				if (!existing.acquired || parseDate(tAcq) > parseDate(existing.acquired)) {
					existing.acquired = dmyOf(tAcq) || tAcq
				}
			}
			if (token.wallets) {
				for (const w of token.wallets) {
					if (existing.wallets.indexOf(w) < 0) existing.wallets.push(w)
				}
			}
			if (token.tx && !existing.history.some(h => h.hash && h.hash === token.tx?.hash && h.tokenId === token.tx?.tokenId)) {
				existing.history.push(token.tx)
			}
			// a collection is spam only when all of it is: one odd token does not condemn the rest
			if (token.unverified) existing.unverified = true
			existing.spam = existing.spam && token.spam
			if (token.oat) existing.oat = true
		}
	}
	const contracts = [...map.values()]
	// a fixed order: a list that shuffles would rewrite the note on every import
	for (const contract of contracts) contract.tokenIds.sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
	return contracts
}

// Every wallet's tokens, grouped. A network counts as read only when all its wallets read in full:
// only then may a token missing from it be taken as gone. BNB and Taiko need the Etherscan key.
interface TezosBalance {
	balance?: unknown
	firstTime?: unknown
	lastTime?: unknown
	lastLevel?: unknown
	token?: { tokenId?: unknown; standard?: unknown; contract?: { address?: unknown; alias?: unknown }; metadata?: { name?: unknown; decimals?: unknown; thumbnailUri?: unknown; displayUri?: unknown; artifactUri?: unknown } | null }
}

export function tezosTokens(items: TezosBalance[]): HeldNft[] {
	const out: HeldNft[] = []
	for (const item of items) {
		const contract = typeof item.token?.contract?.address === 'string' ? item.token.contract.address : ''
		const id = typeof item.token?.tokenId === 'string' ? item.token.tokenId : ''
		const meta = item.token?.metadata
		// a token with decimals is a currency
		if (!contract || !id || !meta || Number(meta.decimals ?? 0) > 0) continue
		const collection = typeof item.token?.contract?.alias === 'string' && item.token.contract.alias ? item.token.contract.alias : contract
		const name = typeof meta.name === 'string' && meta.name ? meta.name : `${collection} #${id}`
		out.push({
			key: nftKey('Tezos', contract, id), chain: 'Tezos', collection, name, contract, tokenId: id, standard: 'FA2',
			image: mediaUrl(meta.displayUri) || mediaUrl(meta.thumbnailUri) || mediaUrl(meta.artifactUri),
			url: `https://tzkt.io/${contract}/tokens/${id}`, count: Number(item.balance) || 1,
			spam: looksLikeSpam(name, collection), oat: false,
			acquired: typeof item.lastTime === 'string' ? item.lastTime : undefined,
		})
	}
	return out
}

async function tezosHeld(address: string): Promise<NftRead> {
	const held: HeldNft[] = []
	for (let offset = 0; offset < 10000; offset += 1000) {
		try {
			const answer = await requestUrl({ url: `https://api.tzkt.io/v1/tokens/balances?account=${address}&balance.gt=0&token.standard=fa2&limit=1000&offset=${String(offset)}`, throw: false })
			if (answer.status !== 200 || !Array.isArray(answer.json)) return { held, chains: [] }
			const items = answer.json as TezosBalance[]
			held.push(...tezosTokens(items))
			if (items.length < 1000) break
		} catch {
			return { held, chains: [] }
		}
	}
	return { held, chains: ['Tezos'] }
}

// Asked once per contract, and only of ids long enough to carry an address. A contract a note already
// knows as a storefront is not asked: an RPC that fails must not fold its collections back together.
async function markStorefronts(held: HeldNft[], known: Set<string>): Promise<void> {
	const answers = new Map<string, boolean>()
	for (const token of held) {
		if (!token.contract || (token.tokenId ?? '').length <= 60) continue
		const key = `${token.chain}:${token.contract}`.toLowerCase()
		let shared = answers.get(key)
		if (shared === undefined) {
			shared = known.has(key)
			const rpc = PUBLIC_RPC[token.chain] || ETHERSCAN_CHAINS[token.chain]?.rpc || ROUTESCAN_CHAINS[token.chain]?.rpc
			if (!shared && rpc) {
				try {
					shared = isStorefrontName(abiString(String(await rpcCall(rpc, 'eth_call', [{ to: token.contract, data: '0x06fdde03' }, 'latest']))))
				} catch {
					shared = false
				}
			}
			answers.set(key, shared)
		}
		if (shared) token.storefront = true
	}
}

interface TonTx {
	hash?: unknown
	utime?: unknown
	block?: unknown
}

async function tonTx(item: string, order: 'asc' | 'desc'): Promise<TonTx | null> {
	const resp = await requestUrl({ url: `https://tonapi.io/v2/blockchain/accounts/${item}/transactions?limit=1&sort_order=${order}`, throw: false })
	return resp.status === 200 ? (resp.json as { transactions?: TonTx[] }).transactions?.[0] ?? null : null
}

// A TON token is an account of its own: its first transaction is the mint, its last the latest transfer.
// A token with its history in a note is not asked again: tonapi allows about a request a second without a key.
async function withTonHistory(read: NftRead, dated: Set<string>): Promise<NftRead> {
	for (const token of read.held) {
		if (dated.has(token.tokenId ?? '')) continue
		const item = token.key.slice('TON:'.length)
		try {
			const first = await tonTx(item, 'asc')
			await sleep(1100)
			const last = await tonTx(item, 'desc')
			await sleep(1100)
			const when = (tx: TonTx | null): string => typeof tx?.utime === 'number' ? new Date(tx.utime * 1000).toISOString() : ''
			if (first) token.minted = when(first)
			if (last) token.acquired = when(last)
			const hash = typeof last?.hash === 'string' ? last.hash : ''
			const block = typeof last?.block === 'string' ? last.block : ''
			if (hash) token.tx = {
				hash, timeStamp: when(last), tokenId: token.tokenId,
				...(block ? { blockNumber: /(\d+)\)$/.exec(block)?.[1] ?? '', blockUrl: `https://tonviewer.com/block/${block}` } : {})
			}
		} catch {
			// a token without its dates is read again next time
		}
	}
	return read
}

interface NearTx {
	cause?: unknown
	transaction_hash?: unknown
	included_in_block_hash?: unknown
	block_timestamp?: unknown
	block?: { block_height?: unknown } | null
}

async function withNearHistory(read: NftRead, dated: Set<string>): Promise<NftRead> {
	for (const token of read.held) {
		if (dated.has(token.tokenId ?? '')) continue
		try {
			const resp = await requestUrl({ url: `https://api.nearblocks.io/v1/nfts/${token.contract ?? ''}/tokens/${token.tokenId ?? ''}/txns?per_page=25`, headers: { accept: 'application/json' }, throw: false })
			const txns = resp.status === 200 ? (resp.json as { txns?: NearTx[] }).txns ?? [] : []
			const when = (tx: NearTx | undefined): string => typeof tx?.block_timestamp === 'string' ? new Date(Number(tx.block_timestamp) / 1e6).toISOString() : ''
			const last = txns[0]
			const mint = txns.find(tx => tx.cause === 'MINT')
			if (mint) token.minted = when(mint)
			if (last) token.acquired = when(last)
			const hash = typeof last?.transaction_hash === 'string' ? last.transaction_hash : ''
			const blockHash = typeof last?.included_in_block_hash === 'string' ? last.included_in_block_hash : ''
			const height = last?.block?.block_height
			if (hash) token.tx = {
				hash, timeStamp: when(last), tokenId: token.tokenId,
				...(typeof height === 'number' ? { blockNumber: String(height) } : {}),
				...(blockHash ? { blockUrl: `https://nearblocks.io/blocks/${blockHash}` } : {})
			}
			await sleep(400)
		} catch {
			// a token without its dates is read again next time
		}
	}
	return read
}

export async function nftHoldings(
	pairs: WalletPair[],
	etherscanKey: string,
	hasCover: (key: string) => boolean = () => false,
	known: (key: string) => KnownToken | undefined = () => undefined,
	openseaKey = '',
	dated: Set<string> = new Set(),
	storefronts: Set<string> = new Set()
): Promise<NftRead> {
	const done = new Map<string, number>()
	const wanted = new Map<string, number>()
	// one call tells which Routescan networks a wallet has anything on: the rest are not asked
	const routescanWallets = new Map<string, Set<string> | null>()
	for (const { chain, address } of pairs) {
		if (ROUTESCAN_CHAINS[chain] && !routescanWallets.has(address)) routescanWallets.set(address, await routescanActive(address))
	}
	const readPair = async (chain: string, address: string): Promise<HeldNft[]> => {
		const host = BLOCKSCOUT[chain]
		const routescan = ROUTESCAN_CHAINS[chain]
		const active = routescanWallets.get(address)
		let read: NftRead | null = null
		if (host) read = await blockscoutHeld(chain, host, address, known)
		else if (routescan) read = active && !active.has(String(routescan.id)) ? { held: [], chains: [chain] } : await routescanHeld(chain, address)
		else if (chain === 'Tezos') read = await tezosHeld(address)
		else if (ETHERSCAN_CHAINS[chain]) read = etherscanKey ? await etherscanHeld(chain, address, etherscanKey) : await pageScanHeld(chain, address, hasCover)
		else if (chain === 'TON') read = await withTonHistory(await tonAllHeld(address), dated)
		else if (chain === 'Solana') read = await solanaHeld(address)
		else if (chain === 'NEAR') read = await withNearHistory(await nearHeld(address), dated)
		if (!read) return []
		wanted.set(chain, (wanted.get(chain) ?? 0) + 1)
		const found = [...read.held]
		for (const token of found) token.wallets = [address]
		if (openseaKey && OPENSEA_CHAINS[chain]) {
			try {
				const rpc = PUBLIC_RPC[chain] || ETHERSCAN_CHAINS[chain]?.rpc || ROUTESCAN_CHAINS[chain]?.rpc
				const listed = await openseaAccountHeld(chain, address, openseaKey)
				const osNfts = rpc ? await stillHeld(rpc, address, listed) : listed
				for (const osToken of osNfts) {
					osToken.wallets = [address]
					const match = found.find(t => t.contract?.toLowerCase() === osToken.contract?.toLowerCase() && t.tokenId === osToken.tokenId)
					if (match) {
						if (!match.image && osToken.image) match.image = osToken.image
						if (!match.minted && osToken.minted) match.minted = osToken.minted
					} else {
						found.push(osToken)
					}
				}
			} catch {
				// ignore
			}
		}
		for (const c of read.chains) done.set(c, (done.get(c) ?? 0) + 1)
		await sleep(80)
		return found
	}
	// networks read side by side, wallets of one network in turn; the explorer pages share one hidden browser,
	// so they form a single lane. Results keep the wallets' order, or notes would change with who answered first.
	const results: HeldNft[][] = pairs.map(() => [])
	const lanes = new Map<string, number[]>()
	pairs.forEach(({ chain }, at) => {
		const lane = !etherscanKey && ETHERSCAN_CHAINS[chain] ? 'pages' : chain
		lanes.set(lane, [...(lanes.get(lane) ?? []), at])
	})
	const queue = [...lanes.values()]
	await Promise.all(Array.from({ length: 6 }, async () => {
		for (let lane = queue.shift(); lane; lane = queue.shift()) {
			for (const at of lane) {
				const pair = pairs[at]
				if (pair) results[at] = await readPair(pair.chain, pair.address)
			}
		}
	}))
	const held = results.reduce((all, part) => all.concat(part), [] as HeldNft[])
	await markStorefronts(held, storefronts)
	// the explorer calls every shared-storefront token "OpenSea Collections": the token's own metadata has its name
	for (const token of held) {
		if (!token.contract || !token.tokenId || !token.storefront) continue
		const osChain = OPENSEA_CHAINS[token.chain]
		const meta = osChain ? await tokenMetadata(`https://api.opensea.io/api/v2/metadata/${osChain}/${token.contract}/0x${idHex(token.tokenId)}`).catch(() => null) : null
		if (typeof meta?.name === 'string' && meta.name) {
			token.name = meta.name
			token.collection = meta.name.replace(/\s*#.*$/, '').trim() || meta.name
		}
		const image = mediaUrl(meta?.image)
		if (image) token.image = image
		await sleep(150)
	}
	const chains = [...wanted.keys()].filter(chain => done.get(chain) === wanted.get(chain))
	if (openseaKey) {
		let osLookups = 0
		for (const token of held) {
			if (osLookups >= 15) break
			if (!token.image && token.contract) {
				if (token.tokenId) {
					token.image = await openseaNftImage(token.chain, token.contract, token.tokenId, openseaKey)
					osLookups++
					await sleep(150)
				}
				if (!token.image) {
					const info = await openseaContract(token.chain, token.contract, openseaKey)
					if (info?.imageUrl && !isInvalidNftMedia(info.imageUrl)) token.image = info.imageUrl
					osLookups++
					await sleep(150)
				}
			}
		}
	}
	return { held: groupHeld(held), chains }
}
