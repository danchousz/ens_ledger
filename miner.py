import csv
import os
from web3 import Web3
from datetime import datetime

from keys import node_address
from ens_wallets import ens_wallets

w3 = Web3(Web3.HTTPProvider(node_address))

contract_addresses = { # Address: (Asset, Decimals)
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": ("USDC", 6),
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": ("WETH", 18),
    "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72": ("ENS", 18)}

wallets_of_interest = { # Only Main ENS Wallets needed
    wallet[2].lower() 
    for wallet in ens_wallets 
    if wallet[1] in ["Treasury Consolidator", "Payment Account"]}

wallet_folders = { # Only Main ENS Wallets needed
    wallet[2].lower(): f"${wallet[0]}" 
    for wallet in ens_wallets
    if wallet[1] in ["Treasury Consolidator", "Payment Account"]}

# A block is processed in 10 seconds, which is two seconds faster than creating a new one. If there is a lag, we can add async
block_number = 19647183
block = w3.eth.get_block(block_number, full_transactions=True)
date = datetime.utcfromtimestamp(block.timestamp).strftime('%Y-%m-%d %H:%M:%S')

transfers = []

# All txs are added to raw directories in accordance with the wallet that participated in the transfer
def add_to_csv(folder_name, file_name, row_data):
    directory = os.path.join('raw_txs', folder_name)
    os.makedirs(directory, exist_ok=True)
    file_path = os.path.join(directory, file_name)
    with open(file_path, 'a', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(row_data)
    print(f"{row_data[0]} added to {file_name} file in {folder_name} folder.")

# Transactions are added to the token file if they relate to erc20, and to Internal if they refer to ETH transfers
def transfer_data(tx_hash, from_address, to_address, contract_address, symbol, value, date, tx_type):
    from_folder = wallet_folders.get(from_address.lower())
    to_folder = wallet_folders.get(to_address.lower())

    if tx_type == "token":
        row_data = [tx_hash, block_number, '|', date, from_address, to_address, value, 0, contract_address, '', symbol]
        file_name = 'token.csv'
    else: # Для internal транзакций
        row_data_from = [tx_hash, block_number, '|', date] + [''] * 3 + [from_address, to_address] + [''] + [0, value] + ['0'] * 3 + [''] * 3
        row_data_to = [tx_hash, block_number, '|', date] + [''] * 3 + [from_address, to_address] + [''] + [value, 0] + ['0'] * 3 + [''] * 3
        file_name = 'internal.csv'

    # Добавляем запись для отправителя
    if from_folder:
        add_to_csv(from_folder, file_name, row_data_from if tx_type == "internal" else row_data)

    # Добавляем запись для получателя, если он отличается от отправителя
    if to_folder and to_folder != from_folder:
        add_to_csv(to_folder, file_name, row_data_to if tx_type == "internal" else row_data)

# Processing "Transfer" transactions
def handle_erc20(log, tx, date):
    from_address = "0x" + log.topics[1].hex()[-40:]
    to_address = "0x" + log.topics[2].hex()[-40:]
    tx_hash = tx.hash.hex()
    contract_address = log.address.lower()
    symbol, decimals = contract_addresses.get(contract_address, ("Unknown", 0))
    value_raw = int(log.data.hex()[-64:], 16)
    value_formatted = f"{value_raw / (10 ** decimals):.{decimals}f}"
    transfer_data(tx_hash, from_address, to_address, contract_address, symbol, value_formatted, date, tx_type='token')

# Processing "ExecTransaction" transactions
def handle_ExecTransaction(log, tx, date):
    tx_hash = tx.hash.hex()
    from_address = log.address.lower()
    to_address = "0x" + tx['input'].hex()[34:74] if len(tx['input']) >= 74 else None
    value_raw = int(tx['input'].hex()[74:138], 16) if len(tx['input']) >= 138 else 0
    value_formatted = f"{value_raw / (10 ** 18):.18f}"
    transfer_data(tx_hash, from_address, to_address, "0x0000000000000000000000000000000000000000", "ETH", value_formatted, date, tx_type='internal')

# Processing "Safe Received" transactions
def handle_SafeReceived(log, tx, date):
    tx_hash = tx.hash.hex()
    from_address = "0x" + log.topics[1].hex()[-40:]
    to_address = log.address.lower()
    value_raw = int(log.data.hex()[-64:], 16)
    value_formatted = f"{value_raw / (10 ** 18):.18f}"
    transfer_data(tx_hash, from_address, to_address, "0x0000000000000000000000000000000000000000", "ETH", value_formatted, date, tx_type='internal')

# Identification of transaction method and iterative search for those of interest
for index, tx in enumerate(block.transactions):
    receipt = w3.eth.get_transaction_receipt(tx.hash)
    interesting_logs = 0

    for log in receipt.logs:
        from_address = "0x" + log.topics[1].hex()[-40:] if len(log.topics) > 1 else None
        to_address = "0x" + log.topics[2].hex()[-40:] if len(log.topics) > 2 else log.address.lower()
        topic_hex = log.topics[0].hex()
        if from_address in wallets_of_interest or to_address in wallets_of_interest:
            if topic_hex == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef':
                handle_erc20(log, tx, date)
                interesting_logs += 1
            elif topic_hex == '0x442e715f626346e8c54381002da614f62bee8d27386535b2521ec8540898556e':
                handle_ExecTransaction(log, tx, date)
                interesting_logs += 1
            elif topic_hex == '0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d':
                handle_SafeReceived(log, tx, date)
                interesting_logs += 1

    if interesting_logs > 0:
        print(f"Block {block_number}: Transaction {index + 1} has {interesting_logs} interesting logs")
    else:
        print(f"Block {block_number}: Transaction {index + 1} has no interesting logs")

print(f"Block {block_number} processed")