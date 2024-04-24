import pandas as pd
import os
from datetime import datetime, timedelta

# Adding quarter as in merger
def add_quarter(date):
    month = date.month
    if (month < 4):
        return f'{date.year} Q1'
    elif (month < 7):
        return f'{date.year} Q2'
    elif (month < 10):
        return f'{date.year} Q3'
    else:
        return f'{date.year} Q4'

# Grouping data to make it similiar to merger output
def group_by_quarter(df):
    df['Quarter'] = df['Date'].apply(add_quarter)
    grouped = df.groupby(['Quarter', 'From', 'To', 'Symbol'], as_index=False).agg({'Value': 'sum', 'DOT_USD': 'sum'})
    return grouped

# Data is saved directly to local and quarterly ledgers
local_file_path = os.path.join('local_ledgers', 'Service Providers.csv')
quarterly_path = os.path.join('quarterly_ledgers', 'Service Providers_q.csv')

start_date = datetime(2024, 1, 1)
current_date = datetime.now()
date_format = '%Y-%m-%d'

new_rows = []
new_df = pd.DataFrame(new_rows)

# Daily reward. The total for the year is 3,609,863.01, since it is a leap year.
providers = {
        'ETHLimo': 1369.8625,
        'Namehash': 1643.835,
        'Resolverworks': 1917.8075,
        'Blockful': 821.9175,
        'Unruggable': 1095.89,
        'Wildcard': 547.945,
        'EFP': 1369.8625,
        'Namespace': 547.945,
        'Unicorn': 547.945
    }

if os.path.exists(local_file_path):
    existing_df = pd.read_csv(local_file_path)
    if not existing_df.empty:
        existing_df['Date'] = pd.to_datetime(existing_df['Date'], format=date_format)
        existing_df['Symbol'] = 'USDC'
        last_date = existing_df['Date'].max()
        start_date = last_date + timedelta(days=1)

while start_date <= current_date:
    for recipient, value in providers.items():
        new_rows.append({
            'Transaction Hash': '',
            'Date': start_date.strftime(date_format),
            'From': 'Service Providers',
            'To': recipient,
            'Value': -value, # The values and DOT_USD are negative since it is "ENS to Endpoint"
            'DOT_USD': -value,
            'Symbol': 'USDC',
            'Acquainted?': 1
        })
    start_date += timedelta(days=1)

local_df = pd.concat([existing_df, new_df]) if 'existing_df' in locals() else new_df

if 'Quarter' in local_df.columns:
    local_df.drop(columns='Quarter', inplace=True)
local_df = local_df[['Transaction Hash', 'Date', 'From', 'To', 'Value', 'DOT_USD', 'Symbol', 'Acquainted?']]
local_df.to_csv(local_file_path, index=False)

grouped_df = group_by_quarter(local_df)
grouped_df.to_csv(quarterly_path, index=False)
os.makedirs('local_ledgers', exist_ok=True)
os.makedirs('quarterly_ledgers', exist_ok=True)