import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ScatterChart, Scatter, ZAxis, ReferenceLine, ComposedChart
} from 'recharts';
import { 
  TrendingUp, BarChart2, Hash, Calendar, PieChart, 
  HelpCircle, AlertTriangle, ShieldCheck, ChevronRight, Activity, ArrowRightLeft 
} from 'lucide-react';

const DEFAULT_TICKERS = ['MEBL.KA', 'NPL.KA', 'SYS.KA', 'FFC.KA', 'HUBC.KA'];

// Helper to format numbers
const fmt = (val, decimals = 2) => {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  return Number(val).toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};

export default function App() {
  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : '';

  // Config & State
  const [selectedTickers, setSelectedTickers] = useState(DEFAULT_TICKERS);
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2026-06-14');
  const [activeTab, setActiveTab] = useState('stats');
  
  // Data State
  const [data, setData] = useState([]);
  const [availableTickers, setAvailableTickers] = useState([]);
  const [statsData, setStatsData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // New Ticker Adding State
  const [allTickers, setAllTickers] = useState([]);
  const [newTicker, setNewTicker] = useState('');
  const [addingTicker, setAddingTicker] = useState(false);
  const [addTickerError, setAddTickerError] = useState(null);

  // Chart Display state
  const [chartView, setChartView] = useState('absolute'); // absolute or normalized
  const [tickerHist, setTickerHist] = useState('');
  
  // Regression State
  const [xVar, setXVar] = useState('');
  const [yVar, setYVar] = useState('');
  const [regressionRes, setRegressionRes] = useState(null);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState(null);
  const [predX, setPredX] = useState('');

  // Colors for lines/charts
  const tickerColors = {
    'MEBL.KA': '#3b82f6', // blue
    'NPL.KA': '#10b981',  // emerald
    'SYS.KA': '#8b5cf6',  // purple
    'FFC.KA': '#f59e0b',  // amber
    'HUBC.KA': '#ec4899', // pink
  };
  const getTickerColor = (ticker) => tickerColors[ticker] || '#64748b';

  // Fetch available tickers from backend
  const fetchTickers = async (autoSelectNew = null) => {
    try {
      const res = await fetch(`${API_BASE}/api/tickers`);
      if (!res.ok) throw new Error('Failed to fetch tickers list.');
      const json = await res.json();
      setAllTickers(json.tickers);
      
      if (autoSelectNew) {
        setSelectedTickers((prev) => {
          if (!prev.includes(autoSelectNew)) {
            return [...prev, autoSelectNew];
          }
          return prev;
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Load tickers on mount
  useEffect(() => {
    fetchTickers();
  }, []);

  // Sync selected tickers when allTickers is loaded the first time
  useEffect(() => {
    if (allTickers.length > 0 && selectedTickers.length === DEFAULT_TICKERS.length && selectedTickers.every((val, i) => val === DEFAULT_TICKERS[i])) {
      const validDefaults = DEFAULT_TICKERS.filter(t => allTickers.includes(t));
      if (validDefaults.length > 0) {
        setSelectedTickers(validDefaults);
      } else {
        setSelectedTickers(allTickers.slice(0, 5));
      }
    }
  }, [allTickers]);

  // Fetch stock price data and descriptive stats
  const fetchData = async () => {
    if (selectedTickers.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const tickersQuery = selectedTickers.join(',');
      
      // Fetch prices
      const dataRes = await fetch(`${API_BASE}/api/data?tickers=${tickersQuery}&start=${startDate}&end=${endDate}`);
      if (!dataRes.ok) throw new Error('Failed to fetch stock prices.');
      const dataJson = await dataRes.json();
      
      setData(dataJson.data);
      setAvailableTickers(dataJson.available_tickers);
      
      // Set defaults for dropdowns if they are empty or not in available list
      if (dataJson.available_tickers.length > 0) {
        if (!dataJson.available_tickers.includes(tickerHist)) {
          setTickerHist(dataJson.available_tickers[0]);
        }
        if (!dataJson.available_tickers.includes(xVar)) {
          setXVar(dataJson.available_tickers[0]);
        }
        if (!dataJson.available_tickers.includes(yVar)) {
          const nextIdx = dataJson.available_tickers.length > 1 ? 1 : 0;
          setYVar(dataJson.available_tickers[nextIdx]);
        }
      }
      
      // Fetch stats
      const statsRes = await fetch(`${API_BASE}/api/stats?tickers=${tickersQuery}&start=${startDate}&end=${endDate}`);
      if (!statsRes.ok) throw new Error('Failed to fetch descriptive statistics.');
      const statsJson = await statsRes.json();
      setStatsData(statsJson.stats);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Trigger main data load on configs change
  useEffect(() => {
    fetchData();
  }, [selectedTickers, startDate, endDate]);

  // Fetch OLS Regression
  const fetchRegression = async () => {
    if (!xVar || !yVar || xVar === yVar) return;
    setRegLoading(true);
    setRegError(null);
    try {
      const res = await fetch(`${API_BASE}/api/regression`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x_var: xVar,
          y_var: yVar,
          start: startDate,
          end: endDate
        })
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || 'Failed to fit OLS regression.');
      }
      const json = await res.json();
      setRegressionRes(json);
    } catch (err) {
      setRegError(err.message);
      setRegressionRes(null);
    } finally {
      setRegLoading(false);
    }
  };

  // Refetch OLS regression if X, Y variables change or dataset changes
  useEffect(() => {
    fetchRegression();
  }, [xVar, yVar, data]);

  // Update prediction X variable to the mean of selected X stock when regression data is loaded
  useEffect(() => {
    if (xVar && statsData[xVar]) {
      setPredX(statsData[xVar].mean.toFixed(2));
    } else {
      setPredX('');
    }
  }, [xVar, statsData]);

  // Toggle ticker selections
  const toggleTicker = (ticker) => {
    if (selectedTickers.includes(ticker)) {
      setSelectedTickers(selectedTickers.filter(t => t !== ticker));
    } else {
      setSelectedTickers([...selectedTickers, ticker]);
    }
  };

  // Normalized Base 100 prices calculation
  const chartData = useMemo(() => {
    if (data.length === 0) return [];
    if (chartView === 'absolute') return data;
    
    // Find first valid price for each ticker
    const firstPrices = {};
    availableTickers.forEach(ticker => {
      const firstValidRow = data.find(row => row[ticker] !== null && row[ticker] !== undefined);
      firstPrices[ticker] = firstValidRow ? firstValidRow[ticker] : 1;
    });

    return data.map(row => {
      const normRow = { ...row };
      availableTickers.forEach(ticker => {
        if (row[ticker] !== null && row[ticker] !== undefined) {
          normRow[ticker] = (row[ticker] / firstPrices[ticker]) * 100;
        }
      });
      return normRow;
    });
  }, [data, chartView, availableTickers]);

  // Compute Client side Histogram
  const histogramData = useMemo(() => {
    if (data.length === 0 || !tickerHist) return [];
    const vals = data.map(p => p[tickerHist]).filter(v => v !== null && v !== undefined);
    if (vals.length === 0) return [];
    
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const binCount = 15;
    const binWidth = (max - min) / binCount;
    
    const bins = Array.from({ length: binCount }, (_, i) => {
      const binStart = min + i * binWidth;
      const binEnd = binStart + binWidth;
      return {
        binStart,
        binEnd,
        name: `${binStart.toFixed(0)}-${binEnd.toFixed(0)}`,
        frequency: 0
      };
    });
    
    vals.forEach(v => {
      let index = Math.floor((v - min) / binWidth);
      if (index >= binCount) index = binCount - 1;
      if (index >= 0 && index < binCount) {
        bins[index].frequency++;
      }
    });
    
    return bins;
  }, [data, tickerHist]);

  // Compute Client side Correlation Matrix
  const correlationMatrix = useMemo(() => {
    if (data.length === 0 || availableTickers.length < 2) return null;
    
    const getCorrelation = (x, y) => {
      const n = x.length;
      if (n < 2) return 0;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
      for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
        sumY2 += y[i] * y[i];
      }
      const num = n * sumXY - sumX * sumY;
      const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
      return den === 0 ? 0 : num / den;
    };

    const matrix = {};
    availableTickers.forEach(t1 => {
      matrix[t1] = {};
      availableTickers.forEach(t2 => {
        const pairs = data
          .map(row => [row[t1], row[t2]])
          .filter(([v1, v2]) => v1 !== null && v1 !== undefined && v2 !== null && v2 !== undefined);
        const x = pairs.map(p => p[0]);
        const y = pairs.map(p => p[1]);
        matrix[t1][t2] = getCorrelation(x, y);
      });
    });
    return matrix;
  }, [data, availableTickers]);

  // Average correlation matrix coefficient
  const avgCorrelation = useMemo(() => {
    if (!correlationMatrix || availableTickers.length < 2) return 0;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < availableTickers.length; i++) {
      for (let j = i + 1; j < availableTickers.length; j++) {
        sum += correlationMatrix[availableTickers[i]][availableTickers[j]];
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }, [correlationMatrix, availableTickers]);

  // Sorted regression points for rendering smooth OLS line
  const sortedRegressionPoints = useMemo(() => {
    if (!regressionRes || !regressionRes.points) return [];
    return [...regressionRes.points].sort((a, b) => a.x - b.x);
  }, [regressionRes]);

  // Volatility classification stats
  const volStats = useMemo(() => {
    if (Object.keys(statsData).length === 0) return [];
    return Object.keys(statsData).map(ticker => ({
      ticker,
      std_dev: statsData[ticker].std_dev,
      coef_var: statsData[ticker].coef_var,
      mean: statsData[ticker].mean,
      category: statsData[ticker].std_dev > 100 
        ? { text: 'High Risk', class: 'text-red' }
        : statsData[ticker].std_dev > 30 
          ? { text: 'Moderate Risk', class: 'text-amber' }
          : { text: 'Conservative', class: 'text-green' }
    }));
  }, [statsData]);

  // Tickers missing from available
  const missingTickers = selectedTickers.filter(t => !availableTickers.includes(t));

  return (
    <div className="app-container">
      {/* Background Glow Blobs for Glassmorphism depth */}
      <div className="bg-blob blob-blue"></div>
      <div className="bg-blob blob-purple"></div>
      <div className="bg-blob blob-cyan"></div>

      {/* SEO hidden tags for crawler parsing */}
      <div className="seo-metadata">
        <h1>PSX Stock Analysis & Statistical Dashboard</h1>
        <p>Analyze central tendencies, regression models, correlation matrices, and risk profiles of Pakistan Stock Exchange indexes.</p>
      </div>

      {/* Sidebar Controls */}
      <aside className="sidebar" id="sidebar-panel">
        <div className="sidebar-brand">
          <div className="sidebar-logo">PSX</div>
          <span className="brand-text">Stock Analytics</span>
        </div>

        {/* Date Filters */}
        <div className="sidebar-section">
          <span className="sidebar-section-title">Date Horizon</span>
          <div className="control-group">
            <label className="control-label" htmlFor="start-date-input">Start Date</label>
            <input 
              id="start-date-input"
              type="date" 
              className="input-date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
            />
          </div>
          <div className="control-group">
            <label className="control-label" htmlFor="end-date-input">End Date</label>
            <input 
              id="end-date-input"
              type="date" 
              className="input-date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
            />
          </div>
        </div>

        {/* Ticker Selector */}
        <div className="sidebar-section">
          <span className="sidebar-section-title">Select Tickers</span>
          <div className="ticker-checkbox-grid">
            {(allTickers.length > 0 ? allTickers : DEFAULT_TICKERS).map(ticker => (
              <label 
                key={ticker} 
                className={`ticker-checkbox-label ${selectedTickers.includes(ticker) ? 'active' : ''}`}
                id={`label-ticker-${ticker.replace('.', '-')}`}
              >
                <span>{ticker}</span>
                <input 
                  id={`checkbox-${ticker.replace('.', '-')}`}
                  type="checkbox" 
                  className="checkbox-input" 
                  checked={selectedTickers.includes(ticker)} 
                  onChange={() => toggleTicker(ticker)}
                />
              </label>
            ))}
          </div>
        </div>

        {/* Add Ticker Section */}
        <div className="sidebar-section">
          <span className="sidebar-section-title">Add Custom Ticker</span>
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newTicker.trim()) return;
              const symbol = newTicker.trim().toUpperCase();
              setAddingTicker(true);
              setAddTickerError(null);
              try {
                const res = await fetch(`${API_BASE}/api/tickers/add?ticker=${symbol}`, {
                  method: 'POST'
                });
                if (!res.ok) {
                  const errJson = await res.json();
                  throw new Error(errJson.detail || 'Failed to download ticker data.');
                }
                const resJson = await res.json();
                const resolvedTicker = resJson.ticker;
                
                await fetchTickers(resolvedTicker);
                setNewTicker('');
              } catch (err) {
                setAddTickerError(err.message);
              } finally {
                setAddingTicker(false);
              }
            }}
            className="control-group"
            style={{ gap: '8px' }}
          >
            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                id="add-ticker-input"
                type="text" 
                className="input-date" 
                style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
                placeholder="e.g. LUCK, AAPL" 
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value)}
                disabled={addingTicker}
              />
              <button 
                id="add-ticker-btn"
                type="submit" 
                className="chart-toggle-btn active"
                style={{ padding: '0 16px', fontSize: '0.85rem', borderRadius: '8px', cursor: 'pointer' }}
                disabled={addingTicker}
              >
                {addingTicker ? '...' : 'Add'}
              </button>
            </div>
            {addTickerError && (
              <div style={{ color: '#fca5a5', fontSize: '0.75rem', marginTop: '2px' }}>
                ⚠️ {addTickerError}
              </div>
            )}
          </form>
        </div>

        {/* Missing Tick Alert */}
        {missingTickers.length > 0 && (
          <div className="alert-banner warning" style={{ marginTop: 'auto', padding: '12px' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '600', fontSize: '0.8rem' }}>No Yahoo API Data</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                {missingTickers.join(', ')} failed to resolve.
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Panel */}
      <main className="main-content">
        <header className="header-panel">
          <h2 className="main-title-text" id="dashboard-heading">PSX Quantitative Stock Analysis</h2>
          <p className="subtitle-text">Descriptive statistics, OLS regression mapping, and diversification evaluations.</p>
        </header>

        {/* Navigation Tabs */}
        <nav className="tabs-bar">
          <button 
            id="tab-btn-stats"
            className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            <Hash size={16} /> 3. Descriptive Stats
          </button>
          <button 
            id="tab-btn-graphics"
            className={`tab-btn ${activeTab === 'graphics' ? 'active' : ''}`}
            onClick={() => setActiveTab('graphics')}
          >
            <BarChart2 size={16} /> 4. Visualization
          </button>
          <button 
            id="tab-btn-regression"
            className={`tab-btn ${activeTab === 'regression' ? 'active' : ''}`}
            onClick={() => setActiveTab('regression')}
          >
            <TrendingUp size={16} /> 5. Regression & Corr
          </button>
          <button 
            id="tab-btn-conclusions"
            className={`tab-btn ${activeTab === 'conclusions' ? 'active' : ''}`}
            onClick={() => setActiveTab('conclusions')}
          >
            <PieChart size={16} /> 6. Strategy & Insights
          </button>
        </nav>

        {/* Main Content Area */}
        {loading ? (
          <div className="spinner-container">
            <div className="spinner"></div>
            <span>Downloading stock quotes & compiling analytics...</span>
          </div>
        ) : error ? (
          <div className="alert-banner warning">
            <AlertTriangle size={24} />
            <div>
              <h4 style={{ margin: '0 0 6px 0' }}>Request Failure</h4>
              <p>{error}</p>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="alert-banner info">
            <AlertTriangle size={24} />
            <div>
              <h4>No Data Tracked</h4>
              <p>Please select tickers and set date horizons that contain active trading records.</p>
            </div>
          </div>
        ) : (
          <div>
            {/* TAB 1: DESCRIPTIVE STATISTICS */}
            {activeTab === 'stats' && (
              <section id="section-descriptive-stats" className="glass-card glow">
                <div className="card-header" style={{ marginBottom: '20px' }}>
                  <h3>Descriptive Statistics Summary</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
                    Central tendency indices and dispersion distributions evaluated over {data.length} trading days.
                  </p>
                </div>
                
                {/* Metrics Cards */}
                <div className="card-grid">
                  <div className="glass-card" style={{ padding: '16px 24px' }}>
                    <div className="metric-card-content">
                      <span className="metric-label-text">Trading Intervals</span>
                      <span className="metric-value-num">{data.length} Days</span>
                    </div>
                  </div>
                  <div className="glass-card" style={{ padding: '16px 24px' }}>
                    <div className="metric-card-content">
                      <span className="metric-label-text">Stocks Active</span>
                      <span className="metric-value-num">{availableTickers.length} / {selectedTickers.length}</span>
                    </div>
                  </div>
                  <div className="glass-card" style={{ padding: '16px 24px' }}>
                    <div className="metric-card-content">
                      <span className="metric-label-text">Start Range</span>
                      <span className="metric-value-num" style={{ fontSize: '1.4rem' }}>{startDate}</span>
                    </div>
                  </div>
                  <div className="glass-card" style={{ padding: '16px 24px' }}>
                    <div className="metric-card-content">
                      <span className="metric-label-text">End Range</span>
                      <span className="metric-value-num" style={{ fontSize: '1.4rem' }}>{endDate}</span>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="table-container">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        {availableTickers.map(ticker => (
                          <th key={ticker} style={{ color: getTickerColor(ticker) }}>{ticker}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="row-label">Mean Price</td>
                        {availableTickers.map(ticker => (
                          <td key={ticker}>{fmt(statsData[ticker]?.mean)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="row-label">Median Price</td>
                        {availableTickers.map(ticker => (
                          <td key={ticker}>{fmt(statsData[ticker]?.median)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="row-label">Mode Price</td>
                        {availableTickers.map(ticker => (
                          <td key={ticker}>{fmt(statsData[ticker]?.mode)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="row-label">Quartile 1 (Q1)</td>
                        {availableTickers.map(ticker => (
                          <td key={ticker}>{fmt(statsData[ticker]?.q1)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="row-label">Quartile 3 (Q3)</td>
                        {availableTickers.map(ticker => (
                          <td key={ticker}>{fmt(statsData[ticker]?.q3)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="row-label">Interquartile Range (IQR)</td>
                        {availableTickers.map(ticker => (
                          <td key={ticker}>{fmt(statsData[ticker]?.iqr)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="row-label">Standard Deviation (σ)</td>
                        {availableTickers.map(ticker => (
                          <td key={ticker} style={{ fontWeight: '600' }}>{fmt(statsData[ticker]?.std_dev)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="row-label">Coef. of Variation (CV %)</td>
                        {availableTickers.map(ticker => (
                          <td key={ticker}>{fmt(statsData[ticker]?.coef_var, 1)}%</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* TAB 2: VISUALIZATION */}
            {activeTab === 'graphics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                {/* Historical Price Chart */}
                <section id="section-graphics-line" className="glass-card glow">
                  <div className="chart-header">
                    <div>
                      <h3>Historical Pricing Timeline</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Visualizing stock fluctuations over the selected timeframe.
                      </p>
                    </div>
                    
                    <div className="chart-controls">
                      <button 
                        id="btn-chart-view-absolute"
                        className={`chart-toggle-btn ${chartView === 'absolute' ? 'active' : ''}`}
                        onClick={() => setChartView('absolute')}
                      >
                        Absolute Price
                      </button>
                      <button 
                        id="btn-chart-view-normalized"
                        className={`chart-toggle-btn ${chartView === 'normalized' ? 'active' : ''}`}
                        onClick={() => setChartView('normalized')}
                      >
                        Normalized (Base 100)
                      </button>
                    </div>
                  </div>

                  <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                      <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                        <XAxis 
                          dataKey="date" 
                          stroke="#64748b" 
                          tick={{ fill: '#64748b', fontSize: 11 }} 
                          tickLine={{ stroke: '#64748b' }}
                        />
                        <YAxis 
                          stroke="#64748b" 
                          tick={{ fill: '#64748b', fontSize: 11 }} 
                          tickLine={{ stroke: '#64748b' }}
                          domain={chartView === 'normalized' ? [50, 'auto'] : ['auto', 'auto']}
                          label={{ 
                            value: chartView === 'normalized' ? 'Relative Performance (%)' : 'Share Price (PKR)', 
                            angle: -90, 
                            position: 'insideLeft', 
                            fill: '#94a3b8',
                            offset: 0,
                            fontSize: 12
                          }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#0f172a', 
                            borderColor: 'rgba(255,255,255,0.1)', 
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '12px'
                          }} 
                        />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                        {availableTickers.map(ticker => (
                          <Line
                            key={ticker}
                            type="monotone"
                            dataKey={ticker}
                            stroke={getTickerColor(ticker)}
                            dot={false}
                            strokeWidth={2}
                            activeDot={{ r: 6 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                {/* Histogram Price Distribution */}
                <section id="section-graphics-histogram" className="glass-card glow">
                  <div className="chart-header">
                    <div>
                      <h3>Price Frequency Distribution (Histogram)</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Evaluates the structural concentration and outliers of stock price data.
                      </p>
                    </div>
                    
                    <select 
                      id="select-histogram-ticker"
                      value={tickerHist} 
                      className="select-dropdown"
                      onChange={(e) => setTickerHist(e.target.value)}
                    >
                      {availableTickers.map(ticker => (
                        <option key={ticker} value={ticker}>{ticker}</option>
                      ))}
                    </select>
                  </div>

                  {histogramData.length > 0 ? (
                    <div style={{ width: '100%', height: 320 }}>
                      <ResponsiveContainer>
                        <BarChart data={histogramData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                          <XAxis 
                            dataKey="name" 
                            stroke="#64748b" 
                            tick={{ fill: '#64748b', fontSize: 10 }} 
                            tickLine={{ stroke: '#64748b' }}
                          />
                          <YAxis 
                            stroke="#64748b" 
                            tick={{ fill: '#64748b', fontSize: 11 }} 
                            tickLine={{ stroke: '#64748b' }}
                            label={{ 
                              value: 'Trading Days Density', 
                              angle: -90, 
                              position: 'insideLeft', 
                              fill: '#94a3b8',
                              offset: 0,
                              fontSize: 12
                            }}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: '#0f172a', 
                              borderColor: 'rgba(255,255,255,0.1)', 
                              color: '#fff',
                              fontSize: '12px'
                            }}
                          />
                          <Bar 
                            dataKey="frequency" 
                            fill={getTickerColor(tickerHist)} 
                            radius={[4, 4, 0, 0]}
                            name="Trading Days Count"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
                      No dataset available to render distribution histograms.
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* TAB 3: REGRESSION & CORRELATION */}
            {activeTab === 'regression' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                
                {/* Correlation Matrix Heatmap */}
                <section id="section-correlation-heatmap" className="glass-card glow">
                  <div className="chart-header">
                    <div>
                      <h3>Asset Price Correlation Matrix</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        Shows Pearson product-moment correlation coefficients between asset pairs.
                      </p>
                    </div>
                  </div>

                  {correlationMatrix ? (
                    <div className="regression-layout" style={{ gridTemplateColumns: '1.2fr 1fr', alignItems: 'center' }}>
                      <div className="heatmap-container">
                        {/* Heatmap Grid */}
                        <div 
                          className="heatmap-grid" 
                          style={{ 
                            gridTemplateColumns: `repeat(${availableTickers.length + 1}, minmax(60px, 1fr))`,
                            width: '100%',
                            maxWidth: '480px'
                          }}
                        >
                          {/* Top left blank corner */}
                          <div className="heatmap-label"></div>
                          {/* Top headers */}
                          {availableTickers.map(t => (
                            <div key={`header-${t}`} className="heatmap-label" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{t.split('.')[0]}</div>
                          ))}

                          {/* Rows */}
                          {availableTickers.map(t1 => (
                            <React.Fragment key={`row-${t1}`}>
                              {/* Left header */}
                              <div className="heatmap-label" style={{ fontSize: '0.75rem', fontWeight: 'bold', justifyContent: 'flex-end', paddingRight: '8px' }}>{t1.split('.')[0]}</div>
                              {/* Cells */}
                              {availableTickers.map(t2 => {
                                const val = correlationMatrix[t1][t2];
                                // Interpolate color between blue (negative), grey (zero), red (positive)
                                let bgStyle = {};
                                if (val > 0) {
                                  // Positive correlation -> red/orange
                                  bgStyle = { backgroundColor: `rgba(239, 68, 68, ${val})` };
                                } else {
                                  // Negative correlation -> blue
                                  bgStyle = { backgroundColor: `rgba(59, 130, 246, ${Math.abs(val)})` };
                                }
                                return (
                                  <div 
                                    key={`${t1}-${t2}`} 
                                    className="heatmap-cell" 
                                    style={bgStyle}
                                    title={`${t1} vs ${t2}: ${val.toFixed(4)}`}
                                  >
                                    {val.toFixed(2)}
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>

                      <div className="stats-card-list">
                        <div className="glass-card" style={{ padding: '16px 20px' }}>
                          <span className="metric-label-text">Mean Port. Correlation</span>
                          <span className="metric-value-num" style={{ display: 'block', margin: '4px 0' }}>
                            {fmt(avgCorrelation, 3)}
                          </span>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {avgCorrelation > 0.7 
                              ? '🚨 High internal coupling. Buying these stocks together provides minimal risk-hedging benefits.' 
                              : avgCorrelation > 0.3 
                                ? '⚖️ Moderate systemic correlation. Solid core asset candidate but should monitor weights.' 
                                : '✅ Low co-movement threshold. These tickers offer excellent diversification benefits.'
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
                      Select 2 or more stock tickers in the sidebar to view the correlation heatmap.
                    </div>
                  )}
                </section>

                {/* OLS Regression Panel */}
                <section id="section-ols-regression" className="glass-card glow">
                  <div className="chart-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '15px' }}>
                    <div>
                      <h3>Linear Regression & Fitting (OLS Model)</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                        Model relationship: Dependent Stock (Y) = &beta; &times; Independent Stock (X) + Intercept
                      </p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div className="control-group" style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <span className="control-label" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>X Variable:</span>
                        <select 
                          id="select-regression-x"
                          value={xVar} 
                          className="select-dropdown"
                          onChange={(e) => setXVar(e.target.value)}
                        >
                          {availableTickers.map(ticker => (
                            <option key={ticker} value={ticker}>{ticker}</option>
                          ))}
                        </select>
                      </div>

                      <div className="control-group" style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <span className="control-label" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>Y Variable:</span>
                        <select 
                          id="select-regression-y"
                          value={yVar} 
                          className="select-dropdown"
                          onChange={(e) => setYVar(e.target.value)}
                        >
                          {availableTickers.map(ticker => (
                            <option key={ticker} value={ticker}>{ticker}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {xVar === yVar ? (
                    <div className="alert-banner warning" style={{ marginTop: '20px' }}>
                      <AlertTriangle size={20} />
                      <span>X and Y stock symbols must be unique to compute a linear regression model.</span>
                    </div>
                  ) : regLoading ? (
                    <div className="spinner-container" style={{ minHeight: '200px' }}>
                      <div className="spinner"></div>
                      <span>Fitting statsmodels OLS model...</span>
                    </div>
                  ) : regError ? (
                    <div className="alert-banner warning" style={{ marginTop: '20px' }}>
                      <AlertTriangle size={20} />
                      <span>{regError}</span>
                    </div>
                  ) : regressionRes ? (
                    <div className="regression-layout" style={{ marginTop: '20px' }}>
                      {/* Scatter Plot with trend line */}
                      <div className="glass-card" style={{ padding: '16px' }}>
                        <div style={{ width: '100%', height: 350 }}>
                          <ResponsiveContainer>
                            <ComposedChart data={sortedRegressionPoints} margin={{ top: 15, right: 20, left: 10, bottom: 10 }}>
                              <XAxis 
                                dataKey="x" 
                                type="number" 
                                domain={['dataMin', 'dataMax']} 
                                name={xVar}
                                stroke="#64748b" 
                                tick={{ fill: '#64748b', fontSize: 10 }}
                                label={{ value: xVar, position: 'bottom', fill: '#94a3b8', fontSize: 11, offset: -2 }}
                              />
                              <YAxis 
                                dataKey="y" 
                                type="number" 
                                domain={['dataMin', 'dataMax']} 
                                name={yVar}
                                stroke="#64748b" 
                                tick={{ fill: '#64748b', fontSize: 10 }}
                                label={{ value: yVar, angle: -90, position: 'left', fill: '#94a3b8', fontSize: 11, offset: 0 }}
                              />
                              <Tooltip 
                                cursor={{ strokeDasharray: '3 3' }} 
                                contentStyle={{ 
                                  backgroundColor: '#0f172a', 
                                  borderColor: 'rgba(255,255,255,0.1)', 
                                  color: '#fff',
                                  fontSize: '12px'
                                }}
                              />
                              <Scatter name="Trading Quote" dataKey="y" fill="#38bdf8" fillOpacity={0.6} />
                              <Line 
                                name="Regression Fit" 
                                dataKey="y_pred" 
                                stroke="#ef4444" 
                                dot={false} 
                                strokeWidth={2.5} 
                                connectNulls
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Regression statistics */}
                      <div className="stats-card-list">
                        <div className="glass-card glow" style={{ borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                          <h4 style={{ marginBottom: '12px', fontSize: '1rem', color: '#60a5fa' }}>Model Fit Summary</h4>
                          <div className="stats-row">
                            <span className="stats-key">Correlation Coefficient (R)</span>
                            <span className="stats-val">{fmt(regressionRes.correlation, 4)}</span>
                          </div>
                          <div className="stats-row">
                            <span className="stats-key">Coefficient of Determination (R²)</span>
                            <span className="stats-val">{fmt(regressionRes.r_squared, 4)}</span>
                          </div>
                          <div className="stats-row">
                            <span className="stats-key">Slope coefficient (&beta;)</span>
                            <span className="stats-val">{fmt(regressionRes.beta, 4)}</span>
                          </div>
                          <div className="stats-row">
                            <span className="stats-key">P-value (Beta significance)</span>
                            <span className="stats-val">{regressionRes.p_value < 0.0001 ? '< 0.0001' : fmt(regressionRes.p_value, 5)}</span>
                          </div>
                          <div className="stats-row">
                            <span className="stats-key">Standard Error</span>
                            <span className="stats-val">{fmt(regressionRes.std_error, 4)}</span>
                          </div>
                        </div>

                        <div className="glass-card" style={{ padding: '16px 20px' }}>
                          <span className="metric-label-text">Model Equation</span>
                          <div style={{ 
                            fontSize: '0.92rem', 
                            fontFamily: 'monospace', 
                            color: '#34d399', 
                            padding: '10px', 
                            backgroundColor: 'rgba(0,0,0,0.3)', 
                            borderRadius: '6px',
                            marginTop: '6px'
                          }}>
                            {regressionRes.equation}
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.4' }}>
                            Around <strong>{fmt(regressionRes.r_squared * 100, 1)}%</strong> of variance in {yVar} prices can be explained linearly by {xVar}. The relationship is <strong>{regressionRes.p_value < 0.05 ? 'statistically significant' : 'not statistically significant'}</strong> at &alpha;=5%.
                          </p>
                        </div>

                        <div className="glass-card glow" style={{ padding: '16px 20px', borderColor: 'rgba(52, 211, 153, 0.2)' }}>
                          <h4 style={{ marginBottom: '12px', fontSize: '1rem', color: '#34d399' }}>Interactive Y Prediction</h4>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                            Input a price value for <strong>{xVar}</strong> to predict the price of <strong>{yVar}</strong> using the OLS model.
                          </p>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                            <div className="control-group" style={{ margin: 0, flex: 1 }}>
                              <label className="control-label" htmlFor="predict-x-input" style={{ fontSize: '0.75rem' }}>Value of X ({xVar.split('.')[0]})</label>
                              <input 
                                id="predict-x-input"
                                type="number" 
                                className="input-date" 
                                style={{ width: '100%', padding: '6px 10px', height: '36px' }}
                                placeholder="Enter value..."
                                value={predX}
                                onChange={(e) => setPredX(e.target.value)} 
                              />
                            </div>
                            <div style={{ fontSize: '1.5rem', color: 'var(--text-secondary)', paddingTop: '16px' }}>➔</div>
                            <div className="control-group" style={{ margin: 0, flex: 1 }}>
                              <span className="control-label" style={{ fontSize: '0.75rem' }}>Predicted Y ({yVar.split('.')[0]})</span>
                              <div style={{ 
                                height: '36px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                padding: '6px 12px', 
                                backgroundColor: 'rgba(255,255,255,0.05)', 
                                border: '1px solid var(--border-color)', 
                                borderRadius: '6px',
                                fontWeight: '600',
                                color: '#60a5fa'
                              }}>
                                {predX !== '' && !isNaN(predX) ? fmt(regressionRes.beta * parseFloat(predX) + regressionRes.intercept) : 'Enter X value'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>
            )}

            {/* TAB 4: CONCLUSIONS & PORTFOLIO STRATEGY */}
            {activeTab === 'conclusions' && (
              <section id="section-conclusions-strategy" className="glass-card glow">
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '15px', marginBottom: '25px' }}>
                  <h3>Conclusions & Asset Allocations</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
                    Qualitative observations generated dynamically from historical volatility indices and co-movement coefficients.
                  </p>
                </div>

                <div className="rec-section">
                  {/* Volatility assessment */}
                  <div className="rec-block">
                    <div className="rec-title-row">
                      <Activity size={20} className="text-amber" />
                      <span>Volatility & Risk Classification (Standard Deviation)</span>
                    </div>
                    <p className="rec-desc">
                      Standard deviation represents stock price dispersion, reflecting overall volatility and risk.
                    </p>
                    <div className="table-container" style={{ marginTop: '10px' }}>
                      <table className="stats-table" style={{ fontSize: '0.85rem' }}>
                        <thead>
                          <tr>
                            <th>Asset</th>
                            <th>Std Dev (σ)</th>
                            <th>Coef. of Variation (CV %)</th>
                            <th>Risk Assessment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {volStats.map(stat => (
                            <tr key={stat.ticker}>
                              <td className="row-label" style={{ color: getTickerColor(stat.ticker) }}>{stat.ticker}</td>
                              <td>{fmt(stat.std_dev)}</td>
                              <td>{fmt(stat.coef_var, 1)}%</td>
                              <td style={{ fontWeight: '600' }}>
                                <span className={stat.category.class}>{stat.category.text}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Comparative sector analysis */}
                  {availableTickers.includes('SYS.KA') && availableTickers.includes('FFC.KA') && (
                    <div className="rec-block">
                      <div className="rec-title-row">
                        <ArrowRightLeft size={20} className="text-blue" />
                        <span>Growth Sector vs. Defensive Comparison (SYS.KA vs FFC.KA)</span>
                      </div>
                      <p className="rec-desc">
                        Comparing <strong>SYS.KA</strong> (Systems Limited - Technology growth stock) and <strong>FFC.KA</strong> (Fauji Fertilizer Company - mature income stock):
                      </p>
                      <div style={{ padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', fontSize: '0.9rem', marginTop: '6px', borderLeft: '3px solid var(--color-accent-blue)' }}>
                        {statsData['SYS.KA']?.std_dev > statsData['FFC.KA']?.std_dev ? (
                          <span>
                            📈 **SYS.KA** exhibits a higher volatility profile (Standard Deviation: {fmt(statsData['SYS.KA']?.std_dev)}) than **FFC.KA** (Standard Deviation: {fmt(statsData['FFC.KA']?.std_dev)}).
                            This is consistent with stock valuation theory: technology firms operate with high beta valuations and high growth premiums, making their share price sensitive to market sentiment. Fauji Fertilizer (FFC) operates in a mature, regulated sector with steady demand and high dividend payouts, creating stable floor valuations and lower risk.
                          </span>
                        ) : (
                          <span>
                            ⚠️ During this specific window, **FFC.KA** showed higher price swings than **SYS.KA** (Std Dev: {fmt(statsData['FFC.KA']?.std_dev)} vs {fmt(statsData['SYS.KA']?.std_dev)}). This indicates unique microeconomic events (corporate dividend announcements, subsidy removals) causing larger relative price corrections in FFC than general market index swings.
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Portfolio recommendations */}
                  {availableTickers.length > 1 && (
                    <div className="rec-block">
                      <div className="rec-title-row">
                        <ShieldCheck size={20} className="text-green" />
                        <span>Asset Allocation Strategy & Diversification Logic</span>
                      </div>
                      <p className="rec-desc">
                        Diversification decreases unsystematic risk. Our mean portfolio correlation coefficient is <strong>{fmt(avgCorrelation, 3)}</strong>.
                      </p>
                      
                      {avgCorrelation > 0.7 ? (
                        <div className="alert-banner warning" style={{ margin: '10px 0 0 0' }}>
                          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
                          <div>
                            <strong>Low Portfolio Diversification Potential:</strong>
                            <p style={{ marginTop: '4px', opacity: 0.9 }}>
                              Because the average correlation is high ({fmt(avgCorrelation, 3)}), these stock prices co-move closely. Holding them in a single index increases systemic vulnerability. Shock events in the PSX will negatively pull down all positions simultaneously. You should consider adding alternative asset classes or defensive international equities to hedge.
                            </p>
                          </div>
                        </div>
                      ) : avgCorrelation > 0.3 ? (
                        <div className="alert-banner info" style={{ margin: '10px 0 0 0' }}>
                          <ChevronRight size={20} style={{ flexShrink: 0 }} />
                          <div>
                            <strong>Moderate Portfolio Diversification Potential:</strong>
                            <p style={{ marginTop: '4px', opacity: 0.9 }}>
                              The average correlation is moderate ({fmt(avgCorrelation, 3)}). The portfolio offers a reasonable degree of risk reduction through industry cross-ownership (e.g. IT, banking, manufacturing). To optimize, balance positions using a minimum-variance weighting method rather than equal weights.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="alert-banner success" style={{ margin: '10px 0 0 0' }}>
                          <ShieldCheck size={20} style={{ flexShrink: 0 }} />
                          <div>
                            <strong>Excellent Portfolio Diversification Potential:</strong>
                            <p style={{ marginTop: '4px', opacity: 0.9 }}>
                              The average correlation is low ({fmt(avgCorrelation, 3)}). The selected assets move independently of each other. This is ideal: negative returns in one sector (e.g. tech) during cycles can be offset by positive returns in defensive sectors (e.g. fertilizers/utilities), leading to smooth, long-term portfolio growth.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
