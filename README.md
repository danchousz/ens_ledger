# ENS Ledger

ENS Ledger is a program that collects ENS wallet transaction data from the blockchain using a node, combines it with manually collected historical data from Etherscan, and creates a database suitable for visualization using various methods.

## Structure

The first version of the application introduces a backend that will generate a database fully suitable for visualization.

[Miner](miner.py), [merger](merger.py) and [stream_grouper](stream_grouper.py) programs.

The [raw_txs](raw_txs) folder contains raw transaction data downloaded from Etherscan or collected from the blockchain for each of the wallets we are interested in. In the token file – ERC-20 transfers, in the internal file – ETH transfers.

The [local_ledgers](local_ledgers) folder contains statements of processed transactions for the wallet of interest. There is only one file, which contains both token and internal transactions, filtered in accordance with the technical specifications.

The [quarterly_ledgers](quarterly_ledgers) folder contains quarterly accounting for each wallet. This is the final data that will be visualized.

The [ens_wallets](ens_wallets.py) file contains tuples with information about addresses and types of ENS wallets. The file contains official ENS wallets and the most common counterparties. Using this file, transactions are assigned an interpretable From or To if the sender or recipient is in the list of tuples.

The [transactions](transactions.py) file contains tuples with information about specific transactions. This dataframe was created to prevent misinterpretation of individual transactions. For example, some steward receives compensation, but was also included in the normalization refund list. So that in the first case the transfer is designated as Steward Compensation, and in the second - as Invalid Names Refund, the transaction hash is checked, and From or To is assigned over the method with ens_wallets. This file is a full-fledged document-extract of transactions from each wallet of the working groups.

The [asset_prices](asset_prices.py) file contains a time series with prices for ETH and $ENS. It helps fill in missing value values at the time of translation.

[Keys](keys.py) for keys.
[Requirements](requirements.txt) for requirements.
[Changelog](changelog.txt) for change log.

## Programs

### The Raw Data Merger

Merger processes the files in raw_txs and assembles the local and quarterly ledger, preparing the data for visualization.

**Filtration.** The program removes unnecessary columns (for example, block number) and rows (for example, those that do not contain(*) Symbol "WETH", "ETH", "USDC" or "ENS" or are null).

**Combination.** The program combines token and internal, bringing them into a common format.

**Calculation** of cost at the time of transaction. The program fills in the missing USD values using asset_prices.

**Polarization.** The program assigns a positive or negative value to transactions depending on whether the wallet in question is the sender or the recipient.

**Naming.** The program names the wallets 'From' and 'To' according to the list of transactions and then using ens_wallets.

**Grouping.** The program adds up all transfers from a specific wallet to a specific wallet within a quarter. For example, if DAO Wallet sent 100 thousand USDC to Metagov on April 5, and 200 thousand USDC on June 12, then there will be only one transfer in the quarterly ledger - from DAO Wallet to Metagov in the amount of 300 thousand USDC.

**Creation of inter-quarter balances.** If any amount is not spent, it will be carried forward to the next quarter. Interquarter balances also help to audit this program: if the last such balance is equal to the current amount of assets in the wallet, then the program is working correctly.

**Sorting.** The program sorts the values grouped within a quarter so that they are easy to read.

Thus, in the output we get the following database _(e.g. Metagov wallet)_:

![Снимок экрана 2024-04-24 в 17 48 47](https://github.com/danchousz/ens_ledger/assets/104145778/7cff881a-0b64-419f-8e91-8856381d07ee)

So we have everything for visualization.

1) Marking by quarters, which will allow us to scale expenses down to quarterly.
2) Transaction parties, which will allow identifying nodes.
3) Names of assets, which will allow us to create various flows and track the movements of the tokens of interest.
4) The cumulative amount at the time of transfers, which will create the USD mode.
5) Interquarter balances, which will allow us to connect the wallet with itself when moving between quarters.

###### *USDCx transactions are not needed, since DAO Wallet transfers USDC to Superfluid, and distribution between specific service providers is performed using stream_grouper (more details below).


### The Real-time Data Miner
The 'Miner' program mines data in real time using transactions such as **Transfer**, **ExecTransaction** and **SafeReceived.**

It iterates through the transactions in the last block and if it **finds transactions associated with DAO wallets**, it adds the corresponding entries to the raw_txs folder of the corresponding wallet, in a format suitable for processing by the merger program.

The program signals in the console if an entry is added:

![Снимок экрана 2024-04-24 в 15 29 51](https://github.com/danchousz/ens_ledger/assets/104145778/1ac2010c-584c-4f3f-85d3-f4adbf9d0db2)
￼

If two ENS wallets are involved in a transaction, then the program **adds records to two wallets at once** (as in the example) in order to then correctly create ledgers.
The program adds all transactions, even failed ones or with tokens of no interest to us, because the logic for filtering them is contained in merger.

The program processes erc-20 (Transfer) and ETH (ExecTransaction, SafeReceived), and **adds them to the corresponding token or internal files.** If both ETH and erc-20 tokens were moved in the same transaction, **the program will include both** (as in the example).

Transactions whose information is obtained in this way have a '|' flag in the UnixTimestamp column of the files in the raw_txs folder. The example took a transfer of 21.5 ETH and 450’300 USDC from DAO_wallet to Public Goods WG. This is what this transaction looks like in the updated csv:

In Internal:
![Снимок экрана 2024-04-24 в 15 48 00](https://github.com/danchousz/ens_ledger/assets/104145778/bbb7f969-623a-487c-9928-bf8ab2ca0156)

And in Token:
![Снимок экрана 2024-04-24 в 15 50 10](https://github.com/danchousz/ens_ledger/assets/104145778/39677eb9-0c60-42c0-99f3-0afa5186606c)

Next, the updated raw_txs are transferred to the merger, where they are correctly transferred to local and quarterly ledgers.

### Stream Grouper

The meaning of the program is very simple - **manually create ledgers for streams for service providers.** The money included in this stream is denominated in USDC and is sent from DAO Wallet to Service Providers. But since we would certainly like to visualize the ratio in which money comes to specific suppliers, this cannot be made pleasing to the eye if we collect information on-chain. First of all, due to the fact that not all suppliers withdraw their money from Superfluid, and it may seem that ENS is paying more for example, to Namespace than to Namehash, simply due to the fact that Namehash, unlike Namespace, has not withdrawn its funds within a certain quarter.

Therefore, it was decided that all money that the service provider can withdraw will be considered paid. For this purpose, this program was created, which **simply calculates how much is due to individual suppliers on a certain date**, and, like a merger, creates ledgers.

## The order of program execution in the backend

**Miner works constantly,** adding information about the presence/absence of transactions of interest and recording them in the database every 10 seconds, which is two seconds faster than block formation. If in the future there are problems with the miner not keeping up with the blockchain, asynchronous functions can be introduced.

**Merger** **runs once a day** to process transactions that have been added by the miner.

**Stream_grouper runs once a day** to update information on enrolled fund providers.
