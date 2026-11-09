Library shows the NFTs your wallets hold as notes, one note per collection, in an NFT category. It only reads public addresses. It never signs anything and needs no key.

## Add a wallet

Open **Settings > Library > NFT** and paste an address. Add as many as you like, in any order: the plugin works out the network from the address. The first read starts a few seconds later and runs by itself, then once a day. **Update all** in the Library tab's header reads it at once.

NFTs are read on desktop. The notes sync to your phone like any other.

## Networks

- EVM addresses are read on 29 networks at once, among them Ethereum, Optimism, Base, Arbitrum, Polygon, BNB Chain, Taiko, Gnosis, Celo, zkSync, Scroll, Avalanche, Blast and Mantle.
- TON, Solana, NEAR and Tezos have addresses of their own.

Every network works without a key. An Etherscan key reads BNB Chain, Polygon and Taiko faster. An OpenSea key adds the creator's profile links and more pictures. Both are in **Settings > Library > API keys**.

## What a note shows

The notes appear first, and the details fill in behind them.

- Icon buttons under the name: the project's site, X, Discord, Telegram, Instagram and OpenSea.
- Network, standard, contract and who created it, your wallets, and the mint and acquired dates.
- Every token you hold, with its picture.
- A transaction history. The hash and the block open in the network's explorer.

A token you created on OpenSea and never sold shows **Not on chain yet**: it has a balance but no transaction. OpenSea's shared contract holds the tokens of every creator, so Library splits it into one note per creator.

## Spam

Tokens that look like phishing drops get `Spam` in their properties and stay hidden. A token you asked for yourself is not spam, and neither is a collection with only some odd tokens in it.

Delete a note and its token counts as spam from then on. To change the verdict on a note, set `Spam` to `true` or `false` yourself. **Show spam NFTs** in the settings shows them all.

Achievement and attendance tokens (Galxe OAT, POAP, Layer3 CUBE) get `Kind: OAT`, and the filter can show them apart.

## Canvases

A wallet, a network and a collection are links. A wallet's canvas shows its tokens by network, a network's shows its collections, and a collection's shows its wallets.

## When a picture is missing

Some pictures live only on the project's own server. When that server is gone, Library tries the explorer, IPFS gateways, NFTScan and OpenSea. Pictures from hosts that are gone, such as quest3 and SecondLive, are fetched again from the token's OpenSea page, without an OpenSea key, on desktop. If none has it, the card stays empty and every import tries again.
