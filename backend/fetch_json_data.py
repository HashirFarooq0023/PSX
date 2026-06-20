import yfinance as yf
import pandas as pd
import json
import numpy as np
import os
from datetime import datetime

# Define Tickers
tickers = {
    'MEBL.KA': 'MEBL.json',
    'NPL.KA': 'NPL.json',
    'SYS.KA': 'SYS.json',
    'FFC.KA': 'FFC.json',
    'HUBC.KA': 'HUBC.json' 
}

# Timeframe from 2024-01-01 to today
start_date = "2024-01-01"
end_date = datetime.today().strftime('%Y-%m-%d')

print(f"Downloading historical stock data from {start_date} to {end_date}...")

for ticker, filename in tickers.items():
    stocks_dir = os.path.join(os.getcwd(), "StocksData")
    output_path = os.path.join(stocks_dir, filename)
    if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
        print(f"Stock data for {ticker} already exists at {output_path}. Skipping download.")
        continue

    print(f"Fetching data for {ticker}...")
    try:
        # Download historical data
        raw_df = yf.download(ticker, start=start_date, end=end_date)
        
        if raw_df.empty:
            print(f"Warning: No data returned for {ticker}.")
            continue
            
        # Structure the DataFrame
        # Columns in yfinance output can be MultiIndex or normal Index depending on download shape.
        # Let's normalize it to a clean DataFrame.
        df = pd.DataFrame(index=raw_df.index)
        
        # Check if columns are MultiIndex
        if isinstance(raw_df.columns, pd.MultiIndex):
            df['Open'] = raw_df['Open'][ticker]
            df['High'] = raw_df['High'][ticker]
            df['Low'] = raw_df['Low'][ticker]
            df['Close'] = raw_df['Close'][ticker]
            df['Adj Close'] = raw_df['Adj Close'][ticker] if 'Adj Close' in raw_df.columns.levels[0] else raw_df['Close'][ticker]
            df['Volume'] = raw_df['Volume'][ticker]
        else:
            df['Open'] = raw_df['Open']
            df['High'] = raw_df['High']
            df['Low'] = raw_df['Low']
            df['Close'] = raw_df['Close']
            df['Adj Close'] = raw_df['Adj Close'] if 'Adj Close' in raw_df.columns else raw_df['Close']
            df['Volume'] = raw_df['Volume']
            
        # Reset index and convert Date to string
        df = df.reset_index()
        df['Date'] = df['Date'].dt.strftime('%Y-%m-%d')
        
        # Replace NaN with None for valid JSON serialization
        df = df.replace({np.nan: None})
        
        # Format records as list of dicts with lowercase keys
        json_records = []
        for _, row in df.iterrows():
            record = {
                'date': row['Date'],
                'open': row['Open'],
                'high': row['High'],
                'low': row['Low'],
                'close': row['Close'],
                'adj_close': row['Adj Close'],
                'volume': int(row['Volume']) if row['Volume'] is not None else 0
            }
            json_records.append(record)
            
        # Write to JSON file
        stocks_dir = os.path.join(os.getcwd(), "StocksData")
        os.makedirs(stocks_dir, exist_ok=True)
        output_path = os.path.join(stocks_dir, filename)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(json_records, f, indent=2)
            
        print(f"Successfully wrote {len(json_records)} records to StocksData/{filename}")
        
    except Exception as e:
        print(f"Failed to fetch/save data for {ticker}: {e}")

print("Done processing all tickers.")
