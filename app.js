const FEE_RATE = 0.005;
const INITIAL_CASH = 1_000_000;

const state = {
  candles: [],
  visibleCount: 0,
  currentIndex: 0,
  pendingAction: null,
  cash: INITIAL_CASH,
  qty: 0,
  avgPrice: 0,
  logs: [],
  buyCount: 0,
  sellCount: 0,
  bestRoi: -Infinity,
  worstRoi: Infinity,
  ended: false,
};

let els = null;
let chart = null;
let candleSeries = null;

function setStatus(message) {
  if (els?.statusEl) els.statusEl.textContent = message;
}

function formatWon(v) {
  return `${Math.round(v).toLocaleString()}원`;
}

function nowPrice() {
  const candle = state.candles[state.currentIndex];
  return candle ? candle.close : 0;
}

function evalAsset(price = nowPrice()) {
  return state.cash + state.qty * price;
}

function roi(price = nowPrice()) {
  return (evalAsset(price) / INITIAL_CASH - 1) * 100;
}

function pushLog(text) {
  const row = `[${new Date().toLocaleString()}] ${text}`;
  state.logs.push(row);
  if (!els?.logEl) return;
  const div = document.createElement('div');
  div.className = 'log-row';
  div.textContent = row;
  els.logEl.prepend(div);
}

function updateMetrics() {
  if (!els?.metricsEl) return;
  const price = nowPrice();
  const valuation = state.qty * price;
  const total = evalAsset(price);
  const roiVal = roi(price);

  state.bestRoi = Math.max(state.bestRoi, roiVal);
  state.worstRoi = Math.min(state.worstRoi, roiVal);

  const data = [
    ['현재가', formatWon(price)],
    ['현금', formatWon(state.cash)],
    ['보유수량', state.qty.toFixed(6)],
    ['평균단가', formatWon(state.avgPrice)],
    ['평가금액', formatWon(valuation)],
    ['총자산', formatWon(total)],
    ['수익률', `${roiVal.toFixed(2)}%`],
    ['대기 주문', state.pendingAction || '-'],
    ['현재 봉 인덱스', state.candles.length ? `${state.currentIndex + 1}/${state.candles.length}` : '-'],
  ];

  els.metricsEl.innerHTML = data
    .map(([k, v]) => `<div class="metric-item"><span>${k}</span><strong>${v}</strong></div>`)
    .join('');
}

function renderChart() {
  if (!candleSeries) return;
  candleSeries.setData(state.candles.slice(0, state.visibleCount));
  chart.timeScale().fitContent();
}

function queueAction(action) {
  if (!state.candles.length || state.ended) return;
  state.pendingAction = action;
  pushLog(`주문 예약: ${action} (다음 봉 시가 체결)`);
  updateMetrics();
}

function executePendingAtOpen(openPrice) {
  const action = state.pendingAction;
  if (!action) return;
  if (action === 'hold') {
    pushLog('보류 선택: 체결 없음');
    state.pendingAction = null;
    return;
  }

  const buyMap = { buy25: 0.25, buy33: 0.33, buy100: 1.0 };
  const sellMap = { sell50: 0.5, sell100: 1.0 };

  if (buyMap[action]) {
    const budget = state.cash * buyMap[action];
    const qty = budget / (openPrice * (1 + FEE_RATE));
    if (qty > 0) {
      const cost = qty * openPrice;
      const fee = cost * FEE_RATE;
      state.cash -= cost + fee;
      state.avgPrice = state.qty + qty > 0 ? ((state.avgPrice * state.qty) + cost + fee) / (state.qty + qty) : 0;
      state.qty += qty;
      state.buyCount += 1;
      pushLog(`매수 체결: ${action}, 가격 ${formatWon(openPrice)}, 수량 ${qty.toFixed(6)}, 수수료 ${formatWon(fee)}`);
    }
  } else if (sellMap[action]) {
    const sellQty = state.qty * sellMap[action];
    if (sellQty > 0) {
      const gross = sellQty * openPrice;
      const fee = gross * FEE_RATE;
      state.cash += gross - fee;
      state.qty -= sellQty;
      if (state.qty <= 1e-10) {
        state.qty = 0;
        state.avgPrice = 0;
      }
      state.sellCount += 1;
      pushLog(`매도 체결: ${action}, 가격 ${formatWon(openPrice)}, 수량 ${sellQty.toFixed(6)}, 수수료 ${formatWon(fee)}`);
    }
  }

  state.pendingAction = null;
}

function nextCandle() {
  if (state.ended || !state.candles.length) return;
  if (state.currentIndex + 1 >= state.candles.length) {
    endTraining('데이터의 마지막 봉에 도달했습니다.');
    return;
  }

  const nextIndex = state.currentIndex + 1;
  executePendingAtOpen(state.candles[nextIndex].open);
  state.currentIndex = nextIndex;
  state.visibleCount = nextIndex + 1;
  renderChart();
  updateMetrics();
}

function endTraining(reason = '사용자 종료') {
  state.ended = true;
  const total = evalAsset();
  els.resultEl.classList.remove('hidden');
  els.resultEl.innerHTML = `
    <h2>훈련 결과 (${reason})</h2>
    <ul>
      <li>최종 현금: ${formatWon(state.cash)}</li>
      <li>최종 보유수량: ${state.qty.toFixed(6)}</li>
      <li>최종 총자산: ${formatWon(total)}</li>
      <li>최종 수익률: ${roi().toFixed(2)}%</li>
      <li>총 매수 횟수: ${state.buyCount}</li>
      <li>총 매도 횟수: ${state.sellCount}</li>
      <li>최고 평가수익률: ${state.bestRoi.toFixed(2)}%</li>
      <li>최저 평가수익률: ${state.worstRoi.toFixed(2)}%</li>
    </ul>
    <h3>거래 로그 전체</h3>
    <pre>${state.logs.join('\n')}</pre>
  `;
}

function resetState() {
  Object.assign(state, {
    candles: [], visibleCount: 0, currentIndex: 0, pendingAction: null,
    cash: INITIAL_CASH, qty: 0, avgPrice: 0, logs: [], buyCount: 0,
    sellCount: 0, bestRoi: -Infinity, worstRoi: Infinity, ended: false,
  });
  els.logEl.innerHTML = '';
  els.resultEl.classList.add('hidden');
  els.resultEl.innerHTML = '';
}

async function loadData(custom = {}) {
  try {
    resetState();
    setStatus('다운로드 중...');

    const symbol = (custom.symbol || els.symbolInput.value || 'BTCUSDT').trim().toUpperCase();
    const limit = Math.max(100, Math.min(1000, Number(custom.limit || els.limitInput.value) || 400));

    let startVal;
    if (custom.startTime) {
      startVal = custom.startTime;
    } else if (els.startInput.value) {
      startVal = new Date(els.startInput.value).getTime();
    } else {
      startVal = Date.now() - limit * 60_000;
    }

    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=${limit}&startTime=${startVal}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('캔들 데이터가 비어 있습니다.');
    }

    state.candles = rows.map((r) => ({
      time: Math.floor(r[0] / 1000),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
    }));

    state.visibleCount = Math.min(30, state.candles.length);
    state.currentIndex = state.visibleCount - 1;

    renderChart();
    updateMetrics();
    setStatus(`다운로드 완료: ${symbol} ${state.candles.length}개 봉`);
    pushLog(`훈련 시작: ${symbol}, 초기자금 ${formatWon(INITIAL_CASH)}, 수수료 매수/매도 각각 0.5%`);
  } catch (e) {
    console.error(e);
    setStatus(`오류: ${e.message}`);
    pushLog(`오류 발생: ${e.message}`);
  }
}

function randomStart() {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const randomBack = Math.floor(Math.random() * 30) * oneDay;
  const randomStartTime = now - randomBack - 500 * 60 * 1000;
  els.symbolInput.value = 'BTCUSDT';
  els.limitInput.value = '500';
  els.startInput.value = '';
  setStatus('랜덤 훈련 데이터 준비 중...');
  loadData({ symbol: 'BTCUSDT', limit: 500, startTime: randomStartTime });
}

function init() {
  try {
    if (!window.LightweightCharts) {
      throw new Error('lightweight-charts 라이브러리 로드 실패');
    }

    els = {
      symbolInput: document.getElementById('symbolInput'),
      startInput: document.getElementById('startInput'),
      limitInput: document.getElementById('limitInput'),
      statusEl: document.getElementById('status'),
      metricsEl: document.getElementById('metrics'),
      logEl: document.getElementById('log'),
      resultEl: document.getElementById('result'),
      loadDataBtn: document.getElementById('loadDataBtn'),
      randomStartBtn: document.getElementById('randomStartBtn'),
      nextCandleBtn: document.getElementById('nextCandleBtn'),
      endTrainingBtn: document.getElementById('endTrainingBtn'),
    };

    const required = Object.entries(els).filter(([, v]) => !v);
    if (required.length > 0) {
      throw new Error(`필수 DOM 요소 누락: ${required.map(([k]) => k).join(', ')}`);
    }

    chart = LightweightCharts.createChart(document.getElementById('chart'), {
      layout: { background: { color: '#0f1620' }, textColor: '#c7d5ea' },
      grid: { vertLines: { color: '#1c2a3f' }, horzLines: { color: '#1c2a3f' } },
      rightPriceScale: { borderColor: '#314864' },
      timeScale: { borderColor: '#314864', timeVisible: true },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    });

    candleSeries = chart.addCandlestickSeries({
      upColor: '#3dc985',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#3dc985',
      wickDownColor: '#ef5350',
    });

    els.loadDataBtn.addEventListener('click', () => {
      setStatus('데이터 다운로드 버튼 클릭됨...');
      loadData();
    });
    els.randomStartBtn.addEventListener('click', randomStart);
    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => queueAction(btn.dataset.action));
    });
    els.nextCandleBtn.addEventListener('click', nextCandle);
    els.endTrainingBtn.addEventListener('click', () => endTraining());

    updateMetrics();
    setStatus('초기화 완료. 데이터를 불러오세요.');
  } catch (e) {
    console.error(e);
    setStatus(`초기화 실패: ${e.message}`);
  }
}

document.addEventListener('DOMContentLoaded', init);
