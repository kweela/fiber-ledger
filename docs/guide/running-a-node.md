# Running a node

The ledger talks to a CKB node, and to a Fiber node when fast payments are configured. It does not
run either. This page covers getting one of each up for development, for testnet and for mainnet.

## Which network to start on

|           | Value | Funding     | Use it for                            |
| --------- | ----- | ----------- | ------------------------------------- |
| `devnet`  | none  | You mine it | Fast iteration, integration tests, CI |
| `testnet` | none  | A faucet    | Real chain behaviour with no cost     |
| `mainnet` | real  | Your own    | Production                            |

Start on devnet. It confirms in seconds and you can mint yourself as much capacity as you need,
which matters because every cell has a 61 CKB floor.

## Without a node at all

The ledger needs a node for anything that touches the chain, but not for a great deal of
development. Wallet creation is a keypair and an address derivation with no chain call, so building
account flows, storing custody material and wiring up your own screens all work offline.

For an application that wants to run its whole flow without a chain, use `MemoryLedger` from
`@kweela/ledger` in place of this package. It settles nothing and costs nothing.

::: warning
`MemoryLedger` keeps wallets in memory, so its references stop resolving when the process restarts.
It is for development and tests, not for a deployed environment.
:::

## devnet

### Run the node

The quickest route is the official image, which ships a ready genesis.

```sh
docker run --rm -it \
  -p 8114:8114 -p 8115:8115 \
  -v "$PWD/devnet:/var/lib/ckb" \
  nervos/ckb:latest run --indexer
```

`--indexer` is not optional for this package. Balances and history are read through the indexer's
`get_cells` and `get_transactions`, so a node without it answers those calls with an error.

To run it from a local binary instead:

```sh
ckb init --chain dev --force
ckb run --indexer
```

### Point the ledger at it

A devnet has no public node, so `url` is required. It also deploys its own scripts, so it has to
say where they landed.

```ts
const ledger = createFiberLedger({
  network: 'devnet',
  url: 'http://127.0.0.1:8114',
  confirmations: 1,
  scripts: JSON.parse(readFileSync('devnet-scripts.json', 'utf8')),
})
```

`confirmations: 1` is worth setting. The default for a non-mainnet network is 4, and on a chain you
are mining yourself that is four blocks you have to produce before anything reads as settled.

::: warning
A devnet can look healthy and still be unable to transfer
A CKB transaction needs to know where the lock script it depends on is deployed. Those script locations are different for each network.

The client already knows the deployments used by the public networks, but those references do not exist on a devnet you started yourself.

That can be misleading because everything else may still look fine. Addresses are derived from the lock's code hash, so they still look valid. Balances come from the indexer, so they still load. The node responds normally, so health checks may appear green.

The problem only shows up when you try to spend. The node rejects the transaction because the referenced script does not exist on that chain.

[`health()`](/guide/health) checks that the configured lock deployment actually exists on the connected chain and reports the problem before it reaches a failed settlement.
:::

How you get the correct script configuration depends on how the devnet was created.

If you are using [offckb](https://github.com/ckb-devrel/offckb), export the devnet scripts with:

```sh
offckb system-scripts --network devnet --export-style ccc | tail -n +3 > devnet-scripts.json
```

If you created the chain with:

```sh
ckb init --chain dev
```

the script deployments are already present in the genesis block. The code cells are outputs from the first transaction, while the dep groups are outputs from the second.

See [Configuration](/reference/configuration#scripts) for the full `scripts` configuration format.

### Produce blocks

Nothing settles on a devnet until something mines. For a test run, the simplest approach is to mine
on demand.

```sh
ckb miner
```

Leave it running and blocks arrive continuously. Integration tests that wait for settlement need
this; without it every movement sits at `submitted` forever.

### Fund a wallet

The genesis block assigns spendable capacity to the addresses in `specs/dev.toml`. Take the private
key for one of them and use it as the faucet the tests expect.

```sh
FIBER_LEDGER_TEST_URL=http://127.0.0.1:8114 \
FIBER_LEDGER_TEST_FAUCET_KEY=0x<genesis-key> \
pnpm test
```

That key needs a real balance, because each wallet the suite creates is funded from it by ordinary
transfer.

## testnet

### Use the public node

No setup at all. Leave `url` out and the ledger connects to the public testnet node.

```ts
const ledger = createFiberLedger({ network: 'testnet' })
```

::: tip
The public nodes are reached over a websocket. The ledger opens that connection and holds it, so
call [`close()`](./health) when you are finished with a ledger.
:::

### Or run your own

Public nodes are rate limited and shared. Anything doing real volume should run its own.

```sh
ckb init --chain testnet
ckb run --indexer
```

Then point at it:

```ts
const ledger = createFiberLedger({
  network: 'testnet',
  url: 'http://127.0.0.1:8114',
})
```

A fresh node syncs the whole chain before it is useful. Expect that to take a while, and watch
[`health()`](./health) rather than guessing.

### Get test CKB

Testnet capacity comes from the faucet at
[faucet.nervos.org](https://faucet.nervos.org). Paste in the address from a wallet you created and
it sends test CKB.

The faucet is rate limited per address and per day. That is usually enough for development, and it
is not enough to fund a wallet each for a large cohort of accounts, so plan cohort testing around
transfers from one funded wallet rather than a faucet call per user.

## mainnet

Everything above applies, with real money attached. Three things change.

### Run your own node

Do not point a production deployment at a public node. It is shared infrastructure with no
availability promise to you, and a rate limit reached mid-transfer surfaces as
`ledger_unavailable`.

```sh
ckb init --chain mainnet
ckb run --indexer
```

A mainnet node needs disk for the full chain and takes a long time to sync from scratch. Let it
finish before any traffic reaches it: an unsynced node reports an old tip, which makes settled
movements look unsettled.

```ts
const ledger = createFiberLedger({
  network: 'mainnet',
  url: process.env.CKB_NODE_URL,
})
```

### Leave confirmations alone

The default is 24 blocks, roughly four minutes. Lowering it means treating a movement as final
sooner than the network does.

```ts
createFiberLedger({ network: 'mainnet', confirmations: 24 })
```

### Hold the keys properly

Two kinds of key matter, and they are not the same risk.

Wallet custody material belongs to the application, encrypted at rest, and is passed in on the calls
that sign. See [Wallets and custody](./wallets).

An `issuerKey` in token mode can create supply. It belongs only in the environment of the service
that mints, and a node that only moves the token should not have it. The ledger reports
`capabilities.minting` as `false` without it, so the rest of the application adapts on its own.

## Fiber

Fiber is a separate node from CKB and is entirely optional. Without it every transfer settles on
chain and `capabilities.fastPayments` is `false`.

Before setting one up, check that it will be used at all: a payment needs a Fiber node on the _other_
end, so transfers between wallets your own application custodies settle on chain whatever you
configure. See [when it earns its keep](./fiber#when-it-earns-its-keep).

### Run the node

Fiber is `fnn`, from [nervosnetwork/fiber](https://github.com/nervosnetwork/fiber). Build it, point
it at the same CKB node and network the ledger uses, and give it a key of its own.

```sh
fnn -c config.yml -d fiber-data
```

Its RPC listens on `8227` by default.

```ts
createFiberLedger({
  network: 'testnet',
  fiber: { url: 'http://127.0.0.1:8227', routeFor },
})
```

::: warning
Fiber and CKB must be on the same network. A Fiber node on testnet paired with a mainnet ledger will
find no usable route, and every transfer will quietly settle on chain instead.
:::

### Open a channel

A channel is what makes a fast payment possible, and it has to exist before the payment does.
Connect to the peer and open one, funding your side with the capacity you expect to send through it.

Until a channel is `ChannelReady` and holds enough on your side, `preferFast` transfers fall back to
the chain. That is by design, so a missing channel is never an outage. It also means a Fiber setup
that is silently not working looks exactly like one that was never configured — check
`transaction.rail` on a payment you expect to be fast.

### Tell the ledger who to pay

The ledger does not discover nodes. `routeFor` maps a destination address to the Fiber node that can
receive for it, and where that mapping comes from is yours to decide. See [Fiber](./fiber).

## Checking it works

`health()` answers whether the ledger can reach what it depends on.

```ts
const health = await ledger.health()

health.reachable // the CKB node answered
health.blockHeight // the tip it reported
health.detail // the network, the node, and whether Fiber answered
```

A reachable node with a tip far behind the real chain is still syncing. A `detail` reading
`fiber down` means the Fiber node is not answering and every transfer is settling on chain.
