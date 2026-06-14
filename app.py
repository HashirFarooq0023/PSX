import os
import json
import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yfinance as yf
import pandas as pd
import numpy as np
from scipy import stats
import statsmodels.api as sm
from datetime import datetime
from typing import List, Optional

app = FastAPI(
    title="PSX Stock Analysis API",
    description="Backend API for fetching stock prices, calculating descriptive statistics, and running OLS regression analysis on Pakistan Stock Exchange tickers.",
    version="1.0.0"
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory tickers
# Startup Migration logic to move files from root to StocksData/
def migrate_files_to_stocks_data():
    stocks_dir = os.path.join(os.getcwd(), "StocksData")
    os.makedirs(stocks_dir, exist_ok=True)
    
    default_files = ['MEBL.json', 'NPL.json', 'SYS.json', 'FFC.json', 'HUBC.json']
    import shutil
    for filename in default_files:
        root_path = os.path.join(os.getcwd(), filename)
        dest_path = os.path.join(stocks_dir, filename)
        if os.path.exists(root_path):
            try:
                if os.path.exists(dest_path):
                    os.remove(dest_path)
                shutil.move(root_path, dest_path)
                print(f"Migrated {filename} to StocksData/")
            except Exception as e:
                print(f"Error migrating {filename}: {e}")

# Run migration on load
migrate_files_to_stocks_data()

IN_MEMORY_STOCK_CACHE = {}

def fetch_stock_data(tickers: List[str], start: str, end: str) -> pd.DataFrame:
    """
    Checks if local JSON files exist in memory, `./StocksData/` or `/tmp/StocksData/`; otherwise downloads from yfinance.
    Uses cached local file if yfinance download fails (network failure).
    """
    combined_data = pd.DataFrame()
    start_dt = pd.to_datetime(start)
    end_dt = pd.to_datetime(end)
    
    for ticker in tickers:
        data_loaded = False
        symbol = ticker.split('.')[0]
        filename = f"{symbol}.json"
        
        # 1. Check in-memory cache first (crucial for Vercel)
        if ticker in IN_MEMORY_STOCK_CACHE:
            try:
                records = IN_MEMORY_STOCK_CACHE[ticker]
                if records:
                    df_ticker = pd.DataFrame(records)
                    if 'date' in df_ticker.columns and ('adj_close' in df_ticker.columns or 'close' in df_ticker.columns):
                        df_ticker['date'] = pd.to_datetime(df_ticker['date'])
                        df_ticker.set_index('date', inplace=True)
                        price_col = 'adj_close' if 'adj_close' in df_ticker.columns else 'close'
                        series = pd.to_numeric(df_ticker[price_col], errors='coerce')
                        series = series[(series.index >= start_dt) & (series.index <= end_dt)]
                        if not series.empty:
                            combined_data[ticker] = series
                            data_loaded = True
                            print(f"Loaded {ticker} from in-memory cache ({len(series)} points)")
            except Exception as e:
                print(f"Error loading from in-memory cache for {ticker}: {e}")

        # 2. Check local directories (StocksData/ and /tmp/StocksData/)
        if not data_loaded:
            for base_dir in [os.getcwd(), "/tmp"]:
                filepath_check = os.path.join(base_dir, "StocksData", filename)
                if os.path.exists(filepath_check) and os.path.getsize(filepath_check) > 0:
                    try:
                        with open(filepath_check, 'r', encoding='utf-8') as f:
                            records = json.load(f)
                        if records:
                            df_ticker = pd.DataFrame(records)
                            if 'date' in df_ticker.columns and ('adj_close' in df_ticker.columns or 'close' in df_ticker.columns):
                                df_ticker['date'] = pd.to_datetime(df_ticker['date'])
                                df_ticker.set_index('date', inplace=True)
                                price_col = 'adj_close' if 'adj_close' in df_ticker.columns else 'close'
                                series = pd.to_numeric(df_ticker[price_col], errors='coerce')
                                series = series[(series.index >= start_dt) & (series.index <= end_dt)]
                                if not series.empty:
                                    combined_data[ticker] = series
                                    data_loaded = True
                                    IN_MEMORY_STOCK_CACHE[ticker] = records
                                    print(f"Loaded {ticker} from local file {filepath_check} ({len(series)} points)")
                                    break
                    except Exception as e:
                        print(f"Error loading local JSON {filepath_check} for {ticker}: {e}")
                
        # 3. Fetch from Yahoo Finance (website)
        if not data_loaded:
            print(f"Fetching {ticker} from Yahoo Finance (website)...")
            try:
                raw_df = yf.download(ticker, start=start, end=end)
                if not raw_df.empty:
                    series = None
                    if isinstance(raw_df.columns, pd.MultiIndex):
                        if 'Adj Close' in raw_df.columns.levels[0] and ticker in raw_df['Adj Close'].columns:
                            series = raw_df['Adj Close'][ticker]
                        elif 'Close' in raw_df.columns.levels[0] and ticker in raw_df['Close'].columns:
                            series = raw_df['Close'][ticker]
                    else:
                        if 'Adj Close' in raw_df.columns:
                            series = raw_df['Adj Close']
                        elif 'Close' in raw_df.columns:
                            series = raw_df['Close']
                            
                    if series is not None and not series.empty:
                        series.index = pd.to_datetime(series.index)
                        series = pd.to_numeric(series, errors='coerce')
                        series = series[(series.index >= start_dt) & (series.index <= end_dt)]
                        
                        if not series.empty:
                            combined_data[ticker] = series
                            data_loaded = True
                            print(f"Successfully downloaded {ticker} from Yahoo Finance ({len(series)} points)")
                            
                            # Cache download back to memory & try saving to disk
                            try:
                                save_df = pd.DataFrame(index=raw_df.index)
                                if isinstance(raw_df.columns, pd.MultiIndex):
                                    save_df['Open'] = raw_df['Open'][ticker]
                                    save_df['High'] = raw_df['High'][ticker]
                                    save_df['Low'] = raw_df['Low'][ticker]
                                    save_df['Close'] = raw_df['Close'][ticker]
                                    save_df['Adj Close'] = raw_df['Adj Close'][ticker] if 'Adj Close' in raw_df.columns.levels[0] else raw_df['Close'][ticker]
                                    save_df['Volume'] = raw_df['Volume'][ticker]
                                else:
                                    save_df['Open'] = raw_df['Open']
                                    save_df['High'] = raw_df['High']
                                    save_df['Low'] = raw_df['Low']
                                    save_df['Close'] = raw_df['Close']
                                    save_df['Adj Close'] = raw_df['Adj Close'] if 'Adj Close' in raw_df.columns else raw_df['Close']
                                    save_df['Volume'] = raw_df['Volume']
                                
                                save_df = save_df.reset_index()
                                save_df['Date'] = save_df['Date'].dt.strftime('%Y-%m-%d')
                                save_df = save_df.replace({np.nan: None})
                                
                                save_records = []
                                for _, row in save_df.iterrows():
                                    save_records.append({
                                        'date': row['Date'],
                                        'open': row['Open'],
                                        'high': row['High'],
                                        'low': row['Low'],
                                        'close': row['Close'],
                                        'adj_close': row['Adj Close'],
                                        'volume': int(row['Volume']) if row['Volume'] is not None else 0
                                    })
                                
                                IN_MEMORY_STOCK_CACHE[ticker] = save_records
                                
                                # Try to write to project directory
                                try:
                                    filepath = os.path.join(os.getcwd(), "StocksData", filename)
                                    os.makedirs(os.path.join(os.getcwd(), "StocksData"), exist_ok=True)
                                    with open(filepath, 'w', encoding='utf-8') as f:
                                        json.dump(save_records, f, indent=2)
                                    print(f"Cached {ticker} data to StocksData/{filename}")
                                except Exception as cache_err:
                                    print(f"Failed to cache fetched data to disk (expected on Vercel): {cache_err}")
                                    try:
                                        # Fallback to writeable /tmp directory
                                        tmp_dir = "/tmp/StocksData"
                                        os.makedirs(tmp_dir, exist_ok=True)
                                        tmp_path = os.path.join(tmp_dir, filename)
                                        with open(tmp_path, 'w', encoding='utf-8') as f:
                                            json.dump(save_records, f, indent=2)
                                        print(f"Cached {ticker} dynamically in /tmp at {tmp_path}")
                                    except Exception as tmp_err:
                                        print(f"Temporary file caching failed: {tmp_err}")
                            except Exception as cache_err:
                                print(f"Failed to cache fetched data: {cache_err}")
                    else:
                        print(f"No valid price series found for {ticker} in download.")
                else:
                    print(f"Empty data returned for {ticker} from yfinance.")
            except Exception as e:
                print(f"Failed to download {ticker} from yfinance: {e}")

            # Offline / Cached Fallbacks
            if not data_loaded:
                for base_dir in [os.getcwd(), "/tmp"]:
                    filepath_check = os.path.join(base_dir, "StocksData", filename)
                    if os.path.exists(filepath_check) and os.path.getsize(filepath_check) > 0:
                        print(f"Network download failed for {ticker}. Attempting fallback to existing local cache at {filepath_check}...")
                        try:
                            with open(filepath_check, 'r', encoding='utf-8') as f:
                                records = json.load(f)
                            if records:
                                df_ticker = pd.DataFrame(records)
                                if 'date' in df_ticker.columns and ('adj_close' in df_ticker.columns or 'close' in df_ticker.columns):
                                    df_ticker['date'] = pd.to_datetime(df_ticker['date'])
                                    df_ticker.set_index('date', inplace=True)
                                    price_col = 'adj_close' if 'adj_close' in df_ticker.columns else 'close'
                                    series = pd.to_numeric(df_ticker[price_col], errors='coerce')
                                    series = series[(series.index >= start_dt) & (series.index <= end_dt)]
                                    if not series.empty:
                                        combined_data[ticker] = series
                                        data_loaded = True
                                        print(f"Fallback successful: loaded {ticker} from file ({len(series)} points)")
                                        break
                        except Exception as fb_err:
                            print(f"Fallback failed for {ticker}: {fb_err}")
                    
    if combined_data.empty:
        raise ValueError("No stock data could be loaded from local files or Yahoo Finance.")
        
    combined_data = combined_data.dropna(how='all').sort_index()
    return combined_data

@app.get("/api/tickers")
async def get_tickers():
    tickers = []
    
    # 1. Scan in-memory cache
    for k in IN_MEMORY_STOCK_CACHE.keys():
        tickers.append(k)
        
    # 2. Scan StocksData directories
    for base_dir in [os.getcwd(), "/tmp"]:
        stocks_dir = os.path.join(base_dir, "StocksData")
        if os.path.exists(stocks_dir):
            try:
                files = [f for f in os.listdir(stocks_dir) if f.endswith(".json")]
                for f in files:
                    symbol = f[:-5]
                    if '.' not in symbol:
                        tickers.append(f"{symbol}.KA")
                    else:
                        tickers.append(symbol)
            except Exception as e:
                print(f"Error scanning directory {stocks_dir}: {e}")
            
    all_tickers = sorted(list(set(tickers + DEFAULT_TICKERS)))
    return {"tickers": all_tickers}

@app.post("/api/tickers/add")
async def add_ticker(ticker: str = Query(..., description="Ticker symbol to add")):
    ticker = ticker.strip().upper()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker symbol cannot be empty.")
        
    yf_symbol = ticker
    if '.' not in ticker:
        yf_symbol = f"{ticker}.KA"
        
    symbol_name = yf_symbol.split('.')[0]
    filename = f"{symbol_name}.json"
    
    start_date = "2024-01-01"
    end_date = datetime.today().strftime('%Y-%m-%d')
    
    print(f"Fetching data for new ticker {yf_symbol}...")
    try:
        raw_df = yf.download(yf_symbol, start=start_date, end=end_date)
        if raw_df.empty and yf_symbol != ticker:
            yf_symbol = ticker
            symbol_name = yf_symbol
            filename = f"{symbol_name}.json"
            raw_df = yf.download(yf_symbol, start=start_date, end=end_date)
            
        if raw_df.empty:
            raise HTTPException(status_code=400, detail=f"No stock data found for ticker {ticker} on Yahoo Finance.")
            
        df = pd.DataFrame(index=raw_df.index)
        if isinstance(raw_df.columns, pd.MultiIndex):
            df['Open'] = raw_df['Open'][yf_symbol]
            df['High'] = raw_df['High'][yf_symbol]
            df['Low'] = raw_df['Low'][yf_symbol]
            df['Close'] = raw_df['Close'][yf_symbol]
            df['Adj Close'] = raw_df['Adj Close'][yf_symbol] if 'Adj Close' in raw_df.columns.levels[0] else raw_df['Close'][yf_symbol]
            df['Volume'] = raw_df['Volume'][yf_symbol]
        else:
            df['Open'] = raw_df['Open']
            df['High'] = raw_df['High']
            df['Low'] = raw_df['Low']
            df['Close'] = raw_df['Close']
            df['Adj Close'] = raw_df['Adj Close'] if 'Adj Close' in raw_df.columns else raw_df['Close']
            df['Volume'] = raw_df['Volume']
            
        df = df.reset_index()
        df['Date'] = df['Date'].dt.strftime('%Y-%m-%d')
        df = df.replace({np.nan: None})
        
        json_records = []
        for _, row in df.iterrows():
            json_records.append({
                'date': row['Date'],
                'open': row['Open'],
                'high': row['High'],
                'low': row['Low'],
                'close': row['Close'],
                'adj_close': row['Adj Close'],
                'volume': int(row['Volume']) if row['Volume'] is not None else 0
            })
            
        # Write to in-memory store
        IN_MEMORY_STOCK_CACHE[yf_symbol] = json_records
        
        # Try writing to root folder
        filepath = os.path.join(os.getcwd(), "StocksData", filename)
        disk_written = False
        try:
            os.makedirs(os.path.join(os.getcwd(), "StocksData"), exist_ok=True)
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(json_records, f, indent=2)
            disk_written = True
        except Exception as cache_err:
            print(f"Disk save failed, expected on Vercel: {cache_err}")
            
        # Try writing to /tmp directory
        if not disk_written:
            try:
                tmp_dir = "/tmp/StocksData"
                os.makedirs(tmp_dir, exist_ok=True)
                tmp_path = os.path.join(tmp_dir, filename)
                with open(tmp_path, 'w', encoding='utf-8') as f:
                    json.dump(json_records, f, indent=2)
                print(f"Saved custom ticker to temporary folder: {tmp_path}")
            except Exception as tmp_err:
                print(f"Failed to write to temporary folder: {tmp_err}")
            
        return {
            "status": "success",
            "ticker": yf_symbol,
            "filename": filename,
            "records_count": len(json_records)
        }
    except Exception as e:
        # Fallback to local files if present
        for base_dir in [os.getcwd(), "/tmp"]:
            filepath_check = os.path.join(base_dir, "StocksData", filename)
            if os.path.exists(filepath_check) and os.path.getsize(filepath_check) > 0:
                return {
                    "status": "success",
                    "ticker": yf_symbol,
                    "filename": filename,
                    "message": "Failed to fetch fresh data, loaded from existing file.",
                    "note": str(e)
                }
        raise HTTPException(status_code=500, detail=f"Failed to fetch stock data for {ticker}: {str(e)}")

@app.get("/api/data")
async def get_data(
    tickers: str = Query(..., description="Comma-separated ticker list"),
    start: str = Query("2024-01-01", description="Start date YYYY-MM-DD"),
    end: str = Query("2026-06-14", description="End date YYYY-MM-DD")
):
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(status_code=400, detail="Invalid ticker list.")
        
    try:
        df = fetch_stock_data(ticker_list, start, end)
        if df.empty:
            return {"data": [], "available_tickers": []}
            
        # Format index as string dates
        df_json = df.copy()
        df_json['date'] = df_json.index.strftime('%Y-%m-%d')
        df_json = df_json.replace({np.nan: None})
        
        records = df_json.to_dict(orient='records')
        available_tickers = list(df.columns)
        
        return {
            "data": records,
            "available_tickers": available_tickers,
            "start_date": df.index.min().strftime('%Y-%m-%d'),
            "end_date": df.index.max().strftime('%Y-%m-%d'),
            "trading_days": len(df)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats")
async def get_stats(
    tickers: str = Query(..., description="Comma-separated ticker list"),
    start: str = Query("2024-01-01", description="Start date YYYY-MM-DD"),
    end: str = Query("2026-06-14", description="End date YYYY-MM-DD")
):
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    try:
        df = fetch_stock_data(ticker_list, start, end)
        if df.empty:
            raise HTTPException(status_code=404, detail="No data available for calculation.")
            
        stats_dict = {}
        for col in df.columns:
            series = df[col].dropna()
            if series.empty:
                continue
            
            q1 = float(series.quantile(0.25))
            q3 = float(series.quantile(0.75))
            
            # Mode
            mode_series = series.mode()
            mode_val = float(mode_series.iloc[0]) if not mode_series.empty else None
            
            mean_val = float(series.mean())
            std_val = float(series.std())
            coef_var = (std_val / mean_val) * 100 if mean_val != 0 else 0
            
            stats_dict[col] = {
                'mean': mean_val,
                'median': float(series.median()),
                'mode': mode_val,
                'q1': q1,
                'q3': q3,
                'iqr': q3 - q1,
                'std_dev': std_val,
                'coef_var': coef_var
            }
            
        return {"stats": stats_dict}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/regression")
async def run_regression(req: RegressionRequest):
    try:
        df = fetch_stock_data([req.x_var, req.y_var], req.start, req.end)
        
        # Verify both columns exist
        if req.x_var not in df.columns or req.y_var not in df.columns:
            raise HTTPException(status_code=400, detail="One or both select stocks failed to download.")
            
        df_clean = df[[req.x_var, req.y_var]].dropna()
        if len(df_clean) < 5:
            raise HTTPException(status_code=400, detail="Insufficient overlapping data points for OLS regression.")
            
        X = sm.add_constant(df_clean[req.x_var])
        model = sm.OLS(df_clean[req.y_var], X).fit()
        
        r_sq = float(model.rsquared)
        coef = float(model.params[req.x_var])
        const = float(model.params['const'])
        p_val = float(model.pvalues[req.x_var])
        std_err = float(model.bse[req.x_var])
        
        # Generate chart data points: [{date, x, y, y_pred}]
        df_clean['y_pred'] = model.predict(X)
        df_clean['date'] = df_clean.index.strftime('%Y-%m-%d')
        
        # Rename columns to standard keys
        df_chart = df_clean.rename(columns={req.x_var: 'x', req.y_var: 'y'})
        df_chart = df_chart.replace({np.nan: None})
        points = df_chart[['date', 'x', 'y', 'y_pred']].to_dict(orient='records')
        
        # Pearson correlation
        corr_val = float(df_clean[[req.x_var, req.y_var]].corr().iloc[0, 1])
        
        # Build equation
        sign = "+" if const >= 0 else "-"
        equation = f"{req.y_var} = {coef:.4f} * ({req.x_var}) {sign} {abs(const):.4f}"
        
        return {
            "x_var": req.x_var,
            "y_var": req.y_var,
            "r_squared": r_sq,
            "beta": coef,
            "intercept": const,
            "p_value": p_val,
            "std_error": std_err,
            "correlation": corr_val,
            "equation": equation,
            "summary_text": str(model.summary()),
            "points": points
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
