import pandas as pd
import os
from glob import glob

from ens_wallets import ens_wallets
from transactions import various_txs
from asset_prices import prices

# Function aimed at unifying data downloaded from etherscan for erc-20 transactions
def process_erc20_txs(token_file, prices_dict):
    df = pd.read_csv(token_file)

    col_to_remove = ['Blockno', 'UnixTimestamp', 'ContractAddress', 'TokenName']
    df.drop(columns=col_to_remove, inplace=True)

    col_to_rename = {
        'DateTime (UTC)': 'Date',
        'TokenValue': 'Value',
        'USDValueDayOfTx': 'DOT_USD',                        #DOT_USD - "DayOfTx", Reflects the amount in USD at the time of the transaction.
        'TokenSymbol': 'Symbol'
    }
    df.rename(columns=col_to_rename, inplace=True)

    df = df[df['Symbol'].isin(['WETH', 'USDC', 'ENS'])]      # DAI is not needed since there are no relevant transactions in the period in question. 
                                                             # USDCx was also not added, since USDC provides all the information on streams.
    df['Original_WETH'] = df['Symbol'] == 'WETH'
    df['Symbol'] = df['Symbol'].replace({'WETH': 'ETH'})     # It is easier to combine those transactions quarterly.

    df['Value'] = pd.to_numeric(df['Value'].astype(str).replace(r'[\$,]', '', regex=True), errors='coerce')
    df['DOT_USD'] = pd.to_numeric(df['DOT_USD'].astype(str).replace(r'[\$,]', '', regex=True), errors='coerce')
    df['Date'] = pd.to_datetime(df['Date']).dt.date

    for index, row in df.iterrows():
        if pd.isna(row['DOT_USD']):
            date = row['Date']                               # Typically Etherscan provides information about the amount at the time of transfer
            value = row['Value']                             # However, this does not always happen; for example, in cases with multisends, DayOfTx has no value.
            symbol = row['Symbol']                           # To solve that, prices_dict was introduced, which stores asset prices.
            if symbol == 'USDC':
                df.at[index, 'DOT_USD'] = value
            elif symbol in ['ETH', 'ENS']:
                price = prices_dict.get(date, (0, 0))[0 if symbol == 'ENS' else 1]
                df.at[index, 'DOT_USD'] = value * price

    return df

# Function aimed at unifying data downloaded from etherscan for internal transactions
def process_internal_txs(internal_file):
    df = pd.read_csv(internal_file)

    col_to_remove = ['Blockno', 'UnixTimestamp', 'ParentTxFrom', 'ParentTxTo', 
                         'ParentTxETH_Value', 'ContractAddress', 'ErrCode', 'Type', 'PrivateNote']
    df.drop(columns=col_to_remove, inplace=True)
    df.drop(columns=[col for col in df if col.startswith('CurrentValue @')], inplace=True)
    df = df[df['Status'] != 1].drop(columns=['Status'])      # Drop failed txs

    numeric_columns = [                                      # The sign in front of the transfer value in ETH is set using the original Value_IN and Value_OUT columns.
        'Value_IN(ETH)', 'Value_OUT(ETH)', 'Historical $Price/Eth']
    for column in numeric_columns:                                                    
        df[column] = pd.to_numeric(df[column], errors='coerce')
    df['Value'] = df.apply(lambda x: x['Value_IN(ETH)'] if x['Value_OUT(ETH)'] == 0 else -x['Value_OUT(ETH)']
                             if x['Value_IN(ETH)'] == 0 else max(x['Value_IN(ETH)'], -x['Value_OUT(ETH)']), axis=1) 
    df['DOT_USD'] = df['Value'] * df['Historical $Price/Eth'] # Calculating DOT_USD for ETH transactions
    df.drop(columns=numeric_columns, inplace=True)

    col_to_rename = {
        'DateTime (UTC)': 'Date', 
        'TxTo': 'To'
    }
    df.rename(columns=col_to_rename, inplace=True)

    df['Symbol'] = 'ETH'

    return df

# Function to merge erc20 and internal txs
def merge_txs(df1, df2):
    merged_df = pd.concat([df1, df2])
    merged_df['Date'] = pd.to_datetime(merged_df['Date'])
    merged_df.sort_values(by='Date', inplace=True)

    merged_df = merged_df[
        (merged_df['Value'] != 0) &                          # Removing Nulls
        ~((merged_df['Symbol'] == 'USDC') & 
        (merged_df['Value'] == 1)) &                         # Removing Tests
        (merged_df['From'] != merged_df['To'])               # Removing Self Txs
    ]

    return merged_df

# Function assigning names to wallets
def identify_wallets(df, wallets_dict, txs_dict, folder_name):
    df['From'] = df['From'].apply(lambda address: 
                    wallets_dict.get(address, address))      # Replacement based on the location of the wallet
    df['To'] = df['To'].apply(lambda address:                # in the 'ens_wallets' category. Read more: readme
                    wallets_dict.get(address, address))

    def replace_on_match(to, from_address, txhash):          # Replacement based on the location of the wallet
        if txhash in txs_dict:                               # in the hand made 'transactions' database. Read more: readme
            if folder_name == from_address:
                return txs_dict[txhash], from_address
            else:
                return to, txs_dict[txhash]
        return to, from_address

    df[['To', 'From']] = df.apply(lambda row: replace_on_match
                                  (row['To'], row['From'], row.get('Transaction Hash', '')), axis=1, result_type='expand')

    def check_acquaintance(row):                             # Flag for further deleting unknown transactions in a grouped dataframe
        from_known = row['From'] in wallets_dict.values() or row['From'] in txs_dict.values()
        to_known = row['To'] in wallets_dict.values() or row['To'] in txs_dict.values()
        return 1 if from_known and to_known else 0
    df['Acquainted?'] = df.apply(check_acquaintance, axis=1)

    mask = (                                                 # The sign before the value for erc20 transactions
        (df['From'] == folder_name) &                        # is assigned using the folder_name membership.
        ((df['Symbol'].isin(['USDC', 'ENS']))                # Let's say DAO Wallet sent 100 USDC to Ecosystem.
        | (df['Original_WETH']))                             # The DAO Wallet ledger will have a transaction with -100 USDC 
    )                                                        # and the Ecosystem ledger will have 100 USDC.
    df.loc[mask, ['Value', 'DOT_USD']] *= -1

    return df

def add_quarter(date):                                       # The sole purpose of this feature is to move the very first
    if date.year == 2022:                                    # working group funding from 2022Q1 to 2022Q2.
        month, day = date.month, date.day
        if (month < 3) or (month == 3 and day < 31):
            return f'{date.year} Q1'
        elif (month == 3 and day == 31) or (month > 3 and month < 7):
            return f'{date.year} Q2'
        elif (month > 6 and month < 10):                     
            return f'{date.year} Q3'                         # The transaction was made on March 31 and this fact would
        else:                                                # have a negative impact on the visualization.
            return f'{date.year} Q4'
    else:
        month = date.month
        if month in (1, 2, 3):
            return f'{date.year} Q1'
        elif month in (4, 5, 6):
            return f'{date.year} Q2'
        elif month in (7, 8, 9):
            return f'{date.year} Q3'
        else:
            return f'{date.year} Q4'

# Grouping by quarter
def group_by_quarter(df):
    df['Quarter'] = df['Date'].apply(add_quarter)
    grouped_df = df.groupby(['Quarter', 'From', 'To', 'Symbol'], as_index=False).agg({'Value': 'sum', 'DOT_USD': 'sum'})
    return grouped_df

# The function adds interquarter balances for the benefit of future visualization
def add_unspent_balances(grouped_df, prices_dict, folder_name):
    unspent_df = pd.DataFrame()
    quarters = sorted(grouped_df['Quarter'].unique())
    symbols = grouped_df['Symbol'].unique()
    cumulative_unspent = {symbol: 0 for symbol in symbols}   # The balances are summed up and transferred to the next interquarter balance

    for quarter in quarters:
        for symbol in symbols:
            quarter_data = grouped_df[(grouped_df['Quarter'] == quarter) & (grouped_df['Symbol'] == symbol)]
            current_unspent_value = quarter_data['Value'].sum() + cumulative_unspent[symbol]
            cumulative_unspent[symbol] = current_unspent_value

            if symbol == 'USDC':                             # DOT_USD of inter-quarter balances
                unspent_dot_usd = current_unspent_value      # are calculated exactly at the end of the quarter
            else:
                unspent_date = get_unspent_date(quarter, prices_dict)
                if unspent_date is None:
                    continue

                price_index = 0 if symbol == 'ENS' else 1
                unspent_dot_usd = current_unspent_value * prices_dict[unspent_date][price_index]

            unspent_row = {
                'Quarter': f"{quarter} Unspent",
                'From': folder_name,
                'To': folder_name if folder_name != "Community WG" else "Community SG",
                'Symbol': symbol,
                'Value': current_unspent_value,              # The balances transferring inside the wallet itself
                'DOT_USD': unspent_dot_usd                   # Except Community WG, since it was dissolved after one Q
            }
            unspent_df = pd.concat([unspent_df, pd.DataFrame([unspent_row])], ignore_index=True)

    return unspent_df

# Interquarter balances have a clear date - the last day of the quarter.
def get_unspent_date(quarter, prices_dict):
    year, q = quarter[:4], quarter[-1]
    quarter_ends = {
        '1': pd.Timestamp(f'{year}-03-31').date(),
        '2': pd.Timestamp(f'{year}-06-30').date(),
        '3': pd.Timestamp(f'{year}-09-30').date(),
        '4': pd.Timestamp(f'{year}-12-31').date()
    }
    target_date = quarter_ends[q]
    available_dates = [pd.to_datetime(date).date() for date in prices_dict.keys()]
    available_dates.sort()

    closest_date = None
    for date in available_dates:
        if date <= target_date:
            closest_date = date
        else:
            break

    if closest_date is None and available_dates:
        closest_date = available_dates[0]

    return closest_date

# Function for sorting quarterly costs. They are not presented in order of date of execution, but in In descending order of amounts.
def finalize_and_sort_df(grouped_with_unspent_df, folder_name):
    sorted_df = pd.DataFrame()
    quarters = grouped_with_unspent_df['Quarter'].unique()

    for quarter in quarters:
        quarter_data = grouped_with_unspent_df[grouped_with_unspent_df['Quarter'] == quarter].copy()
        if "Unspent" in quarter:
            sorted_df = pd.concat([sorted_df, quarter_data])
        else:
            incoming_transactions = quarter_data[quarter_data['From'] != folder_name]
            outgoing_transactions = quarter_data[quarter_data['From'] == folder_name]
            incoming_sorted = incoming_transactions.sort_values(by='DOT_USD', ascending=False)
            outgoing_sorted = outgoing_transactions.sort_values(by='DOT_USD', ascending=True)
            sorted_data = pd.concat([incoming_sorted, outgoing_sorted])
            sorted_df = pd.concat([sorted_df, sorted_data])

    return sorted_df

# Main Function. Specifies the rules for working with directories and libraries as well as the order in which functions are performed.
def process_directories(ens_wallets, various_txs):

    raw_data_dir = 'raw_txs'
    local_ledgers_dir = 'local_ledgers'
    os.makedirs(local_ledgers_dir, exist_ok=True)
    quarter_dir = 'quarterly_ledgers'
    os.makedirs(quarter_dir, exist_ok=True)

    wallets_dict = {address: name for name, _, address in ens_wallets}
    txs_dict = {tx[1]: tx[0] for tx in various_txs}
    prices_dict = {pd.to_datetime(date).date(): (ens_price, eth_price) for date, ens_price, eth_price in prices}

    for folder in glob(os.path.join(raw_data_dir, '$*')):
        folder_name = os.path.basename(folder).strip('$')

        token_file = os.path.join(folder, 'token.csv')
        internal_file = os.path.join(folder, 'internal.csv')

        token_df = process_erc20_txs(token_file, prices_dict).copy()
        internal_df = process_internal_txs(internal_file).copy()

        merged_df = merge_txs(token_df, internal_df)
        named_df = identify_wallets(merged_df, wallets_dict, txs_dict, folder_name).copy()

        local_ledgers_file = os.path.join(local_ledgers_dir, f'{folder_name}.csv')
        named_df.to_csv(local_ledgers_file, index=False, columns=[col for col in named_df.columns if col != 'Original_WETH'])

        acquainted_df = named_df[named_df['Acquainted?'] == 1].copy()
        cleaned_df = acquainted_df[(acquainted_df['From'] != 'WETH Contract') & (acquainted_df['To'] != 'WETH Contract')].copy()
        grouped_df = group_by_quarter(cleaned_df)

        unspent_rows_df = add_unspent_balances(grouped_df, prices_dict, folder_name)
        grouped_with_unspent_df = pd.concat([grouped_df, unspent_rows_df]).sort_values(by='Quarter')
        final_df = finalize_and_sort_df(grouped_with_unspent_df, folder_name)

        grouped_file = os.path.join(quarter_dir, f'{folder_name}_q.csv')
        final_df.to_csv(grouped_file, index=False)

process_directories(ens_wallets, various_txs)